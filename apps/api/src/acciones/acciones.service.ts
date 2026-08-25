import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  acciones,
  comprobacionesAccion,
  deteccionesFechas,
  deteccionesHueco,
  deteccionesStock,
  extraespacios,
  gananciasFacings,
  marcas,
  neveras,
  oportunidadesReorganizacion,
  oportunidadesVisibilidad,
  referenciasProducto,
  relacionesResponsable,
  tiendas,
  topPicosPendientes,
  usuarios,
  visitas,
} from "@sw/db";
import {
  UMBRAL_ESTANCADA_DIAS,
  diasAbierta,
  estaEstancada,
  grupoSituacion,
  resolverResponsable,
  type CategoriaProducto,
  type TipoSituacion,
} from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";
import type { Configuracion } from "../config/configuracion";
import type {
  BandejaAccionesDto,
  CambiarEstadoAccionDto,
  ComprobarDto,
  RegistrarAccionDto,
  RelacionResponsableDto,
} from "./dto/acciones.dto";

type EstadoAccion = "abierta" | "en_curso" | "resuelta" | "descartada";

/**
 * El cliente dentro de una transacción.
 *
 * No es el mismo tipo que `ClienteDb`: una transacción no expone `$client`. Se
 * deriva del propio `transaction` para no quedar desacoplado si Drizzle cambia
 * la firma.
 */
type ClienteTx = Parameters<Parameters<ClienteDb["transaction"]>[0]>[0];

/**
 * Transiciones permitidas de una acción.
 *
 * Se declara explícitamente en lugar de aceptar cualquier cambio. `resuelta` y
 * `descartada` son terminales: reabrir algo cerrado hace meses descuadraría los
 * agregados de un periodo ya informado.
 */
const TRANSICIONES: Record<EstadoAccion, EstadoAccion[]> = {
  abierta: ["en_curso", "resuelta", "descartada"],
  en_curso: ["resuelta", "descartada", "abierta"],
  resuelta: [],
  descartada: [],
};

@Injectable()
export class AccionesService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService<Configuracion, true>,
  ) {}

  private get umbralEstancada(): number {
    return this.config.get("ACCION_ESTANCADA_DIAS", { infer: true }) ?? UMBRAL_ESTANCADA_DIAS;
  }

  // ── Catálogos ────────────────────────────────────────────────────────

  /** Marcas activas, opcionalmente de una sola categoría de producto. */
  async marcasDisponibles(categoria?: string) {
    return this.db
      .select({
        id: marcas.id,
        nombre: marcas.nombre,
        codigo: marcas.codigo,
        categoriaProducto: marcas.categoriaProducto,
      })
      .from(marcas)
      .where(
        categoria
          ? and(eq(marcas.activo, true), sql`${marcas.categoriaProducto}::text = ${categoria}`)
          : eq(marcas.activo, true),
      )
      .orderBy(marcas.orden, marcas.nombre);
  }

  /** Referencias de producto activas, para elegir el Top Pico que falta. */
  async referenciasDisponibles(categoria?: string) {
    return this.db
      .select({
        id: referenciasProducto.id,
        nombre: referenciasProducto.nombre,
        codigo: referenciasProducto.codigo,
        categoriaProducto: referenciasProducto.categoriaProducto,
      })
      .from(referenciasProducto)
      .where(
        categoria
          ? and(
              eq(referenciasProducto.activo, true),
              sql`${referenciasProducto.categoriaProducto}::text = ${categoria}`,
            )
          : eq(referenciasProducto.activo, true),
      )
      .orderBy(referenciasProducto.orden, referenciasProducto.nombre);
  }

  // ── Registrar una detección ──────────────────────────────────────────

  /**
   * Crea una acción a partir de lo que el GPV detecta en la visita.
   *
   * Dos decisiones importantes ocurren aquí:
   *
   * 1. **El responsable lo calcula el servidor**, nunca llega del cliente. Si
   *    fuera una elección, la misma situación escalaría distinto según quién la
   *    registrase y los agregados dejarían de ser comparables.
   *
   * 2. **La acción cuelga de la tienda**, no de la visita. La visita solo
   *    queda como origen, para poder responder dónde se detectó.
   */
  async registrar(visitaId: string, usuario: PayloadToken, dto: RegistrarAccionDto) {
    // Idempotencia offline: la cola puede reenviar una operación cuya respuesta
    // se perdió. Se comprueba antes de tocar nada.
    if (dto.idCliente) {
      const [existente] = await this.db
        .select()
        .from(acciones)
        .where(eq(acciones.idCliente, dto.idCliente))
        .limit(1);
      if (existente) return existente;
    }

    const visita = await this.visitaEditable(visitaId, usuario);

    const categoria = dto.categoriaProducto as CategoriaProducto;
    const tipo = dto.tipoSituacion as TipoSituacion;
    const regla = resolverResponsable(tipo, categoria);

    await this.validarReferencias(dto);

    // La acción y su detalle van en una transacción: una acción sin detalle es
    // una fila que nadie sabe interpretar, y sin transacción un fallo a mitad
    // la dejaría exactamente así.
    const creada = await this.db.transaction(async (tx) => {
      const [accion] = await tx
        .insert(acciones)
        .values({
          tiendaId: visita.tiendaId,
          visitaOrigenId: visita.id,
          categoriaProducto: categoria,
          tipoSituacion: tipo,
          responsableActuar: regla.responsable,
          prioridad: dto.prioridad ?? "media",
          detectadaEn: dto.detectadaEn ?? new Date(),
          idCliente: dto.idCliente ?? null,
        })
        .returning();

      await this.insertarDetalle(tx, accion!.id, dto);
      return accion!;
    });

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "accion.registrada",
      entidad: "accion",
      entidadId: creada.id,
      cambios: {
        situacion: { antes: null, despues: `${tipo}/${categoria}` },
        responsable: { antes: null, despues: regla.responsable },
      },
    });

    return { ...creada, motivoResponsable: regla.motivo, reglaDerivada: regla.origen === "derivado" };
  }

  /** Escribe la fila de detalle que corresponde al tipo de situación. */
  private async insertarDetalle(tx: ClienteTx, accionId: string, dto: RegistrarAccionDto) {
    switch (dto.tipoSituacion) {
      case "stock":
        await tx.insert(deteccionesStock).values({
          accionId,
          suficiencia: dto.suficiencia,
          comunicadoAlResponsable: dto.comunicadoAlResponsable ?? null,
        });
        return;

      case "fechas":
        await tx.insert(deteccionesFechas).values({
          accionId,
          problema: dto.problema,
          detalle: dto.detalle?.trim() || null,
        });
        return;

      case "hueco":
        await tx.insert(deteccionesHueco).values({
          accionId,
          existeHueco: dto.existeHueco,
          cubiertoConAdyacente: dto.cubiertoConAdyacente ?? null,
          correccion: dto.correccion ?? null,
        });
        return;

      case "top_pico":
        await tx.insert(topPicosPendientes).values({
          accionId,
          referenciaId: dto.referenciaId,
        });
        return;

      case "facings":
        await tx.insert(gananciasFacings).values({
          accionId,
          marcaId: dto.marcaId ?? null,
          conseguido: dto.conseguido,
          facingsGanados: dto.facingsGanados,
        });
        return;

      case "visibilidad":
        await tx.insert(oportunidadesVisibilidad).values({
          accionId,
          marcaId: dto.marcaId ?? null,
          ubicacionActual: dto.ubicacionActual,
          propuesta: dto.propuesta,
        });
        return;

      case "reorganizacion":
        await tx.insert(oportunidadesReorganizacion).values({
          accionId,
          propuesta: dto.propuesta.trim(),
        });
        return;

      case "extraespacio":
        await tx.insert(extraespacios).values({
          accionId,
          tipo: dto.tipo,
          motivo: dto.motivo,
        });
        return;

      case "nevera": {
        // La nevera ES un extraespacio según el boceto; `neveras` solo añade lo
        // que es específico suyo.
        const [extra] = await tx
          .insert(extraespacios)
          .values({ accionId, tipo: "nevera", motivo: dto.motivo })
          .returning();
        await tx.insert(neveras).values({
          extraespacioId: extra!.id,
          situacion: dto.situacion,
          // Se guarda TAL CUAL: es la clave con la que el FSM informa en su
          // aplicación de neveras. Normalizarlo podría romper esa
          // correspondencia y hacer que se retire la unidad equivocada.
          codigoNevera: dto.codigoNevera ?? null,
        });
        return;
      }
    }
  }

  /** Marca y referencia deben existir y estar activas antes de tocar nada. */
  private async validarReferencias(dto: RegistrarAccionDto) {
    if (dto.tipoSituacion === "top_pico") {
      const [ref] = await this.db
        .select({ id: referenciasProducto.id })
        .from(referenciasProducto)
        .where(
          and(
            eq(referenciasProducto.id, dto.referenciaId),
            eq(referenciasProducto.activo, true),
          ),
        )
        .limit(1);
      if (!ref) throw new BadRequestException("Referencia no válida o dada de baja");
    }

    const marcaId =
      dto.tipoSituacion === "facings" || dto.tipoSituacion === "visibilidad"
        ? dto.marcaId
        : undefined;

    if (marcaId) {
      const [marca] = await this.db
        .select({ id: marcas.id })
        .from(marcas)
        .where(and(eq(marcas.id, marcaId), eq(marcas.activo, true)))
        .limit(1);
      if (!marca) throw new BadRequestException("Marca no válida o dada de baja");
    }
  }

  // ── Seguimiento entre visitas ────────────────────────────────────────

  /**
   * Lo que sigue abierto en una tienda.
   *
   * Es la consulta que la app de campo hace al iniciar una visita, y la razón
   * de que la acción cuelgue de la tienda: aquí no hace falta recorrer las
   * visitas anteriores.
   */
  async abiertasDeTienda(tiendaId: string, usuario: PayloadToken) {
    await this.tiendaVisible(tiendaId, usuario);
    const ahora = new Date();

    const filas = await this.db
      .select({
        accion: acciones,
        referencia: { id: referenciasProducto.id, nombre: referenciasProducto.nombre },
        comprobaciones: sql<number>`(
          select count(*)::int from ${comprobacionesAccion}
          where ${comprobacionesAccion.accionId} = ${acciones.id}
        )`,
      })
      .from(acciones)
      .leftJoin(topPicosPendientes, eq(topPicosPendientes.accionId, acciones.id))
      .leftJoin(referenciasProducto, eq(referenciasProducto.id, topPicosPendientes.referenciaId))
      .where(
        and(
          eq(acciones.tiendaId, tiendaId),
          inArray(acciones.estado, ["abierta", "en_curso"]),
        ),
      )
      .orderBy(asc(acciones.detectadaEn));

    return filas.map((f) => this.decorar(f.accion, ahora, {
      referencia: f.referencia?.id ? f.referencia : null,
      comprobaciones: f.comprobaciones,
    }));
  }

  /** Top Picos que siguen sin incorporarse en una tienda. */
  async topPicosPendientesDeTienda(tiendaId: string, usuario: PayloadToken) {
    await this.tiendaVisible(tiendaId, usuario);

    return this.db
      .select({
        accionId: acciones.id,
        detectadaEn: acciones.detectadaEn,
        referencia: {
          id: referenciasProducto.id,
          nombre: referenciasProducto.nombre,
          codigo: referenciasProducto.codigo,
        },
        categoriaProducto: acciones.categoriaProducto,
        responsableActuar: acciones.responsableActuar,
      })
      .from(topPicosPendientes)
      .innerJoin(acciones, eq(acciones.id, topPicosPendientes.accionId))
      .innerJoin(referenciasProducto, eq(referenciasProducto.id, topPicosPendientes.referenciaId))
      .where(
        and(
          eq(acciones.tiendaId, tiendaId),
          eq(topPicosPendientes.incorporada, false),
          inArray(acciones.estado, ["abierta", "en_curso"]),
        ),
      )
      .orderBy(asc(acciones.detectadaEn));
  }

  /**
   * Pronunciarse sobre una acción abierta.
   *
   * Cada comprobación se **añade**; ninguna sobreescribe a la anterior. Guardar
   * solo el último estado haría imposible responder cuánto tardó en resolverse
   * algo, que es una de las preguntas del dashboard.
   */
  async comprobar(accionId: string, usuario: PayloadToken, dto: ComprobarDto) {
    if (dto.idCliente) {
      const [existente] = await this.db
        .select()
        .from(comprobacionesAccion)
        .where(eq(comprobacionesAccion.idCliente, dto.idCliente))
        .limit(1);
      if (existente) return existente;
    }

    const accion = await this.accionAccesible(accionId, usuario);

    if (accion.estado === "resuelta" || accion.estado === "descartada") {
      throw new ConflictException("Esta acción ya está cerrada");
    }

    // Si se comprueba desde una visita, tiene que ser del propio GPV.
    if (dto.visitaId) {
      await this.visitaEditable(dto.visitaId, usuario);
    }

    const cierra = dto.desenlace === "resuelta" || dto.desenlace === "no_procede";

    const comprobacion = await this.db.transaction(async (tx) => {
      const [fila] = await tx
        .insert(comprobacionesAccion)
        .values({
          accionId,
          visitaId: dto.visitaId ?? null,
          usuarioId: usuario.sub,
          desenlace: dto.desenlace,
          comentario: dto.comentario?.trim() || null,
          comprobadaEn: dto.comprobadaEn ?? new Date(),
          idCliente: dto.idCliente ?? null,
        })
        .returning();

      if (cierra) {
        await tx
          .update(acciones)
          .set({
            estado: dto.desenlace === "resuelta" ? "resuelta" : "descartada",
            resueltaEn: new Date(),
            // Quién cerró y con qué rol. Con dos actores capaces de cerrar, sin
            // esta traza no se sabe si fue el FSM tras hablar con el reponedor
            // o el GPV al ver el hueco ya cubierto.
            cerradaPor: usuario.sub,
            cerradaPorRol: usuario.rol,
            notaResultado: dto.comentario?.trim() || null,
          })
          .where(eq(acciones.id, accionId));

        // Un Top Pico resuelto es un Top Pico incorporado: es la métrica de
        // resultado, y dejarla sin actualizar la haría contar de menos.
        if (accion.tipoSituacion === "top_pico" && dto.desenlace === "resuelta") {
          await tx
            .update(topPicosPendientes)
            .set({ incorporada: true, incorporadaEn: new Date() })
            .where(eq(topPicosPendientes.accionId, accionId));
        }
      }

      return fila!;
    });

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "accion.comprobada",
      entidad: "accion",
      entidadId: accionId,
      cambios: {
        desenlace: { antes: accion.estado, despues: dto.desenlace },
      },
    });

    return comprobacion;
  }

  /** Historial completo de una acción, en orden. */
  async historial(accionId: string, usuario: PayloadToken) {
    await this.accionAccesible(accionId, usuario);

    return this.db
      .select({
        comprobacion: comprobacionesAccion,
        autor: {
          nombre: usuarios.nombre,
          numeroTrabajador: usuarios.numeroTrabajador,
          rol: usuarios.rol,
        },
      })
      .from(comprobacionesAccion)
      .innerJoin(usuarios, eq(usuarios.id, comprobacionesAccion.usuarioId))
      .where(eq(comprobacionesAccion.accionId, accionId))
      .orderBy(asc(comprobacionesAccion.comprobadaEn));
  }

  // ── Panel del FSM ────────────────────────────────────────────────────

  /**
   * Acciones pendientes, ordenadas por antigüedad.
   *
   * La antigüedad no es decorativa: una de las preguntas que el cliente quiere
   * responder es qué lleva demasiado tiempo abierto.
   */
  async bandeja(usuario: PayloadToken, filtros: BandejaAccionesDto) {
    const ahora = new Date();
    const condiciones = [];

    // Un supervisor solo ve su zona. Sin este filtro su bandeja se llenaría de
    // acciones de tiendas que no gestiona.
    if (usuario.rol === "supervisor") {
      if (!usuario.zonaId) return [];
      condiciones.push(eq(tiendas.zonaId, usuario.zonaId));
    }

    // Con `cerradasPorGpv` el estado por defecto no sirve: lo que se busca
    // está cerrado precisamente.
    if (filtros.estado) {
      condiciones.push(eq(acciones.estado, filtros.estado));
    } else if (!filtros.cerradasPorGpv) {
      condiciones.push(inArray(acciones.estado, ["abierta", "en_curso"]));
    }

    if (filtros.categoriaProducto) {
      condiciones.push(eq(acciones.categoriaProducto, filtros.categoriaProducto));
    }
    if (filtros.responsableActuar) {
      condiciones.push(eq(acciones.responsableActuar, filtros.responsableActuar));
    }
    if (filtros.tiendaId) condiciones.push(eq(acciones.tiendaId, filtros.tiendaId));
    if (filtros.tipoSituacion) {
      condiciones.push(sql`${acciones.tipoSituacion}::text = ${filtros.tipoSituacion}`);
    }
    if (filtros.soloEstancadas) {
      condiciones.push(
        sql`${acciones.detectadaEn} < now() - (${this.umbralEstancada} || ' days')::interval`,
      );
    }

    /**
     * Acciones que el FSM tenía asignadas y cerró un GPV.
     *
     * El dato se registraba desde el principio, pero no se veía: la bandeja
     * muestra por defecto lo abierto, y estas ya están cerradas. Sin un filtro
     * propio, el aviso de "la cerró el GPV" no llegaba a aparecer nunca y el
     * FSM se enteraba de que su bandeja había menguado por casualidad.
     */
    if (filtros.cerradasPorGpv) {
      condiciones.push(eq(acciones.responsableActuar, "fsm"));
      condiciones.push(eq(acciones.cerradaPorRol, "comercial"));
    }

    const filas = await this.db
      .select({
        accion: acciones,
        tienda: {
          id: tiendas.id,
          nombre: tiendas.nombre,
          numeroReferencia: tiendas.numeroReferencia,
          localidad: tiendas.localidad,
          canal: tiendas.canal,
        },
        detectadaPor: {
          nombre: usuarios.nombre,
          numeroTrabajador: usuarios.numeroTrabajador,
        },
        codigoNevera: sql<string | null>`(
          select n.codigo_nevera from ${neveras} n
          join ${extraespacios} e on e.id = n.extraespacio_id
          where e.accion_id = ${acciones.id}
        )`,
        comprobaciones: sql<number>`(
          select count(*)::int from ${comprobacionesAccion}
          where ${comprobacionesAccion.accionId} = ${acciones.id}
        )`,
      })
      .from(acciones)
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(and(...condiciones))
      // Lo más antiguo primero: es lo que lleva más tiempo sin resolverse.
      .orderBy(asc(acciones.detectadaEn))
      .limit(filtros.limite);

    return filas.map((f) => ({
      ...this.decorar(f.accion, ahora, {}),
      tienda: f.tienda,
      detectadaPor: f.detectadaPor,
      codigoNevera: f.codigoNevera,
      comprobaciones: f.comprobaciones,
    }));
  }

  /**
   * Cuántas acciones del FSM ha cerrado un GPV últimamente.
   *
   * Alimenta el aviso del panel. Se acota a los últimos días porque el aviso
   * es «mira esto», no un contador histórico que solo puede crecer.
   */
  async cerradasPorGpv(usuario: PayloadToken, dias = 7): Promise<number> {
    const condiciones = [
      eq(acciones.responsableActuar, "fsm"),
      eq(acciones.cerradaPorRol, "comercial"),
      sql`${acciones.resueltaEn} > now() - (${dias} || ' days')::interval`,
    ];

    if (usuario.rol === "supervisor") {
      if (!usuario.zonaId) return 0;
      condiciones.push(eq(tiendas.zonaId, usuario.zonaId));
    }

    const [fila] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(acciones)
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(and(...condiciones));

    return fila?.n ?? 0;
  }

  /** Cierre o cambio de estado desde el panel. */
  async cambiarEstado(
    accionId: string,
    usuario: PayloadToken,
    dto: CambiarEstadoAccionDto,
  ) {
    const accion = await this.accionAccesible(accionId, usuario);
    const actual = accion.estado as EstadoAccion;

    if (!TRANSICIONES[actual].includes(dto.estado)) {
      throw new ConflictException(`No se puede pasar de "${actual}" a "${dto.estado}"`);
    }

    const cierra = dto.estado === "resuelta" || dto.estado === "descartada";

    const [actualizada] = await this.db
      .update(acciones)
      .set({
        estado: dto.estado,
        resueltaEn: cierra ? new Date() : null,
        cerradaPor: cierra ? usuario.sub : null,
        cerradaPorRol: cierra ? usuario.rol : null,
        notaResultado: dto.notaResultado ?? accion.notaResultado,
      })
      .where(eq(acciones.id, accionId))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "accion.estado_cambiado",
      entidad: "accion",
      entidadId: accionId,
      cambios: { estado: { antes: actual, despues: dto.estado } },
    });

    return actualizada!;
  }

  // ── Relación con el responsable de tienda ────────────────────────────

  /**
   * Una fila por visita, no por categoría: en cada punto de venta hay un único
   * encargado. Por eso es un upsert y no un insert.
   */
  async guardarRelacionResponsable(
    visitaId: string,
    usuario: PayloadToken,
    dto: RelacionResponsableDto,
  ) {
    const visita = await this.visitaEditable(visitaId, usuario);

    const valores = {
      visitaId: visita.id,
      haHablado: dto.haHablado,
      valoracion: dto.valoracion ?? null,
      cuestionPendiente: dto.cuestionPendiente,
      comentario: dto.comentario?.trim() || null,
      idCliente: dto.idCliente ?? null,
    };

    const [fila] = await this.db
      .insert(relacionesResponsable)
      .values(valores)
      .onConflictDoUpdate({
        target: relacionesResponsable.visitaId,
        set: {
          haHablado: valores.haHablado,
          valoracion: valores.valoracion,
          cuestionPendiente: valores.cuestionPendiente,
          comentario: valores.comentario,
        },
      })
      .returning();

    return fila!;
  }

  // ── Resumen de la visita ─────────────────────────────────────────────

  /**
   * Lo registrado en la visita, agrupado por categoría (SPECS §5.7).
   *
   * No es decorativo: es la última oportunidad del GPV de ver qué ha generado y
   * corregir un error antes de que la visita quede inmutable.
   */
  async resumenVisita(visitaId: string, usuario: PayloadToken) {
    const visita = await this.visitaVisible(visitaId, usuario);

    const registradas = await this.db
      .select({
        categoriaProducto: acciones.categoriaProducto,
        tipoSituacion: acciones.tipoSituacion,
        responsableActuar: acciones.responsableActuar,
        total: sql<number>`count(*)::int`,
        facings: sql<number>`coalesce(sum(${gananciasFacings.facingsGanados}), 0)::int`,
      })
      .from(acciones)
      .leftJoin(gananciasFacings, eq(gananciasFacings.accionId, acciones.id))
      .where(eq(acciones.visitaOrigenId, visitaId))
      .groupBy(acciones.categoriaProducto, acciones.tipoSituacion, acciones.responsableActuar);

    const [relacion] = await this.db
      .select()
      .from(relacionesResponsable)
      .where(eq(relacionesResponsable.visitaId, visitaId))
      .limit(1);

    // Acciones de esta tienda que siguen abiertas de visitas ANTERIORES: el
    // GPV debería pronunciarse sobre ellas antes de cerrar.
    const previas = await this.db
      .select({ pendientesPrevias: sql<number>`count(*)::int` })
      .from(acciones)
      .where(
        and(
          eq(acciones.tiendaId, visita.tiendaId),
          inArray(acciones.estado, ["abierta", "en_curso"]),
          sql`${acciones.visitaOrigenId} <> ${visitaId}`,
        ),
      );
    const pendientesPrevias = previas[0]?.pendientesPrevias ?? 0;

    /**
     * El boceto divide cada categoría en tres bloques —incidencias,
     * oportunidades y extraespacios— y muestra los extraespacios en su propio
     * apartado del resumen, fuera de las categorías. La clasificación vive en
     * `@sw/shared` para que el dashboard cuente lo mismo que el resumen.
     */
    const porCategoria: Record<string, {
      incidencias: number;
      oportunidades: number;
      paraElFsm: number;
      facingsGanados: number;
      situaciones: Record<string, number>;
    }> = {};

    let extraespaciosTotal = 0;
    const extraespaciosPorTipo: Record<string, number> = {};

    for (const fila of registradas) {
      const grupo = grupoSituacion(fila.tipoSituacion);

      if (grupo === "extraespacio") {
        extraespaciosTotal += fila.total;
        extraespaciosPorTipo[fila.tipoSituacion] =
          (extraespaciosPorTipo[fila.tipoSituacion] ?? 0) + fila.total;
        continue;
      }

      const clave = fila.categoriaProducto;
      porCategoria[clave] ??= {
        incidencias: 0,
        oportunidades: 0,
        paraElFsm: 0,
        facingsGanados: 0,
        situaciones: {},
      };
      const acumulado = porCategoria[clave]!;

      if (grupo === "oportunidad") acumulado.oportunidades += fila.total;
      else acumulado.incidencias += fila.total;

      if (fila.responsableActuar === "fsm") acumulado.paraElFsm += fila.total;
      acumulado.facingsGanados += fila.facings;
      acumulado.situaciones[fila.tipoSituacion] =
        (acumulado.situaciones[fila.tipoSituacion] ?? 0) + fila.total;
    }

    return {
      visitaId,
      estado: visita.estado,
      porCategoria,
      extraespacios: { total: extraespaciosTotal, porTipo: extraespaciosPorTipo },
      relacionResponsable: relacion
        ? {
            haHablado: relacion.haHablado,
            valoracion: relacion.valoracion,
            cuestionPendiente: relacion.cuestionPendiente,
          }
        : null,
      pendientesPrevias,
      /**
       * En el MVP no hay mínimos obligatorios para cerrar (decisión consciente
       * del cliente). Se informa de lo que falta, no se bloquea.
       *
       * Se devuelven CÓDIGOS, no frases. La app está en cinco idiomas y una
       * frase construida aquí saldría en castellano para un GPV que tiene la
       * interfaz en francés — el clásico hueco de i18n en los bordes, donde la
       * pantalla está traducida pero el mensaje del servidor no.
       */
      avisos: [
        ...(relacion ? [] : [{ codigo: "sinRelacionResponsable" as const }]),
        ...(pendientesPrevias > 0
          ? [{ codigo: "pendientesSinComprobar" as const, n: pendientesPrevias }]
          : []),
      ],
    };
  }

  // ── Auxiliares ───────────────────────────────────────────────────────

  /**
   * Añade lo que se deriva y no se guarda: días abierta y si está estancada.
   *
   * "Estancada" no es una columna. Como estado permitiría que algo estuviera
   * estancado y resuelto a la vez, o que dejara de estarlo sin que nadie
   * hiciera nada (SPECS §7.1).
   */
  private decorar<T extends Record<string, unknown>>(
    accion: typeof acciones.$inferSelect,
    ahora: Date,
    extra: T,
  ) {
    const abierta = accion.estado === "abierta" || accion.estado === "en_curso";
    return {
      ...accion,
      diasAbierta: diasAbierta(accion.detectadaEn, ahora),
      estancada: abierta && estaEstancada(accion.detectadaEn, ahora, this.umbralEstancada),
      ...extra,
    };
  }

  private async accionAccesible(accionId: string, usuario: PayloadToken) {
    const [fila] = await this.db
      .select({ accion: acciones, zonaTienda: tiendas.zonaId })
      .from(acciones)
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(eq(acciones.id, accionId))
      .limit(1);

    if (!fila) throw new NotFoundException("Acción no encontrada");

    if (usuario.rol === "supervisor" && fila.zonaTienda !== usuario.zonaId) {
      throw new ForbiddenException("Esta acción no es de tu zona");
    }
    if (usuario.rol === "comercial" && fila.zonaTienda !== usuario.zonaId) {
      throw new ForbiddenException("Esta acción no es de tu zona");
    }
    return fila.accion;
  }

  private async tiendaVisible(tiendaId: string, usuario: PayloadToken) {
    const [tienda] = await this.db
      .select()
      .from(tiendas)
      .where(eq(tiendas.id, tiendaId))
      .limit(1);

    if (!tienda) throw new NotFoundException("Tienda no encontrada");
    if (
      (usuario.rol === "comercial" || usuario.rol === "supervisor") &&
      tienda.zonaId !== usuario.zonaId
    ) {
      throw new ForbiddenException("Esta tienda no es de tu zona");
    }
    return tienda;
  }

  private async visitaEditable(visitaId: string, usuario: PayloadToken) {
    const [visita] = await this.db
      .select()
      .from(visitas)
      .where(eq(visitas.id, visitaId))
      .limit(1);

    if (!visita) throw new NotFoundException("Visita no encontrada");
    if (visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta visita no es tuya");
    }
    if (visita.estado === "finalizada" || visita.estado === "no_realizada") {
      throw new ConflictException("La visita está cerrada y no admite cambios");
    }
    return visita;
  }

  private async visitaVisible(visitaId: string, usuario: PayloadToken) {
    const [visita] = await this.db
      .select()
      .from(visitas)
      .where(eq(visitas.id, visitaId))
      .limit(1);

    if (!visita) throw new NotFoundException("Visita no encontrada");
    if (usuario.rol === "comercial" && visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta visita no es tuya");
    }
    return visita;
  }
}
