import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  categorias,
  incidencias,
  itemsChecklist,
  plantillasChecklist,
  resultadosChecklist,
  rutasDiarias,
  tiendas,
  usuarios,
  visitas,
  zonas,
} from "@sw/db";
import { evaluarDesviacion, fechaLocal, type Idioma } from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import { resolver } from "../comun/i18n";
import type { Configuracion } from "../config/configuracion";
import type { PayloadToken } from "../auth/auth.service";
import type { Punto } from "@sw/db";

@Injectable()
export class VisitasService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly config: ConfigService<Configuracion, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Vista del día del comercial (SPECS §5.2).
   *
   * Devuelve la ruta planificada más las visitas no planificadas del día, en
   * una sola lista. La card de una visita extra es indistinguible salvo por la
   * etiqueta, que es justo lo que se especificó.
   */
  async vistaDelDia(usuario: PayloadToken, idioma: Idioma, fechaPedida?: string) {
    const zonaHoraria = await this.zonaHorariaDe(usuario.sub);
    const fecha = fechaPedida ?? fechaLocal(new Date(), zonaHoraria);

    await this.materializarRuta(usuario.sub, fecha);

    /**
     * Se conserva el LEFT JOIN aunque `materializarRuta` acabe de crear las
     * filas que faltaban: al consultar un día pasado no se materializa nada, y
     * sin el join externo esas rutas desaparecerían del histórico.
     */
    const planificadas = await this.db
      .select({
        rutaId: rutasDiarias.id,
        orden: rutasDiarias.ordenSugerido,
        tienda: tiendas,
        visita: visitas,
      })
      .from(rutasDiarias)
      .innerJoin(tiendas, eq(tiendas.id, rutasDiarias.tiendaId))
      .leftJoin(
        visitas,
        and(
          eq(visitas.rutaDiariaId, rutasDiarias.id),
          eq(visitas.usuarioId, usuario.sub),
        ),
      )
      .where(
        and(
          eq(rutasDiarias.usuarioId, usuario.sub),
          eq(rutasDiarias.fecha, fecha),
        ),
      )
      .orderBy(asc(rutasDiarias.ordenSugerido));

    /**
     * Las que NO cuelgan de una ruta.
     *
     * Desde que una visita fuera de rutero se incorpora a la ruta del día,
     * casi todas tienen `rutaDiariaId`. Sin este filtro aparecerían dos veces:
     * una por la consulta de arriba y otra por esta.
     *
     * La consulta se conserva igualmente para el histórico: las visitas
     * creadas antes de ese cambio no tienen ruta y desaparecerían del día.
     */
    const sueltas = await this.db
      .select({ tienda: tiendas, visita: visitas })
      .from(visitas)
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .where(
        and(
          eq(visitas.usuarioId, usuario.sub),
          eq(visitas.fecha, fecha),
          eq(visitas.planificada, false),
          isNull(visitas.rutaDiariaId),
        ),
      );

    const tarjetas = [
      // `planificada` sale de la VISITA, no de estar en el rutero: ahora
      // conviven en la ruta las previstas y las que el GPV añadió sobre la
      // marcha, y la etiqueta debe distinguirlas.
      ...planificadas.map((f) =>
        this.tarjeta(f.tienda, f.visita, f.visita?.planificada ?? true, f.orden),
      ),
      ...sueltas.map((f) => this.tarjeta(f.tienda, f.visita, false, null)),
    ];

    const finalizadas = tarjetas.filter((t) => t.estado === "finalizada").length;
    const noRealizadas = tarjetas.filter((t) => t.estado === "no_realizada").length;

    return {
      fecha,
      zonaHoraria,
      /**
       * Hora local a la que cierra la jornada.
       *
       * Viaja con la vista del día para que la app pueda avisar con antelación
       * de las visitas sin justificar. Calcularla en el cliente a partir de una
       * constante propia haría que un cambio de configuración en el servidor
       * dejara al comercial con un aviso a destiempo.
       */
      horaCierre: this.config.get("CIERRE_JORNADA_HORA", { infer: true }),
      resumen: {
        total: tarjetas.length,
        finalizadas,
        noRealizadas,
        pendientes: tarjetas.filter((t) => t.estado === "pendiente").length,
        enCurso: tarjetas.filter((t) => t.estado === "en_curso").length,
        /** Sin justificar y ya cerradas: es lo que el supervisor mirará. */
        sinJustificar: tarjetas.filter(
          (t) => t.estado === "no_realizada" && !t.justificada,
        ).length,
      },
      visitas: tarjetas,
    };
  }

  /**
   * Resumen de la última visita a la misma tienda (SPECS §5.4).
   *
   * Da continuidad: el comercial ve al entrar qué se encontró la vez anterior
   * y qué quedó abierto, y evita reportar por tercera vez una rotura de stock
   * que ya está en la bandeja del supervisor sin resolver.
   *
   * Busca en TODO el histórico de la tienda, no solo en las visitas del
   * comercial actual: una tienda puede cambiar de mano entre zonas o cubrirse
   * por otro compañero, y lo que importa es el estado del punto de venta.
   */
  async contextoAnterior(visitaId: string, usuario: PayloadToken) {
    const { visita } = await this.visitaPropia(visitaId, usuario);

    const [anterior] = await this.db
      .select({
        id: visitas.id,
        fecha: visitas.fecha,
        estado: visitas.estado,
        incompleta: visitas.incompleta,
        notasLibres: visitas.notasLibres,
        comercial: usuarios.nombre,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(
        and(
          eq(visitas.tiendaId, visita.tiendaId),
          sql`${visitas.id} <> ${visitaId}`,
          sql`${visitas.fecha} < ${visita.fecha}`,
          eq(visitas.estado, "finalizada"),
        ),
      )
      .orderBy(sql`${visitas.fecha} desc`)
      .limit(1);

    /**
     * Las incidencias abiertas se buscan en TODAS las visitas anteriores, no
     * solo en la última. Una rotura de stock reportada hace tres semanas y sin
     * resolver sigue siendo lo primero que el comercial debe comprobar.
     */
    const abiertas = await this.db
      .select({
        id: incidencias.id,
        prioridad: incidencias.prioridad,
        estado: incidencias.estado,
        descripcion: incidencias.descripcion,
        fecha: visitas.fecha,
        categoria: categorias.nombre,
        tipo: categorias.tipo,
      })
      .from(incidencias)
      .innerJoin(visitas, eq(visitas.id, incidencias.visitaId))
      .innerJoin(categorias, eq(categorias.id, incidencias.categoriaId))
      .where(
        and(
          eq(visitas.tiendaId, visita.tiendaId),
          sql`${visitas.id} <> ${visitaId}`,
          sql`${incidencias.estado} in ('abierta', 'en_revision')`,
        ),
      )
      .orderBy(sql`${incidencias.prioridad} desc`, sql`${visitas.fecha} desc`)
      .limit(10);

    return { anterior: anterior ?? null, incidenciasAbiertas: abiertas };
  }

  /**
   * Crea una visita no planificada (SPECS §5.3).
   *
   * Queda marcada con `planificada: false` para que los informes distingan
   * cobertura planificada de oportunista, y para detectar al comercial que
   * casi nunca sigue la ruta asignada.
   */
  async crearNoPlanificada(
    tiendaId: string,
    usuario: PayloadToken,
    idCliente?: string,
  ) {
    if (idCliente) {
      const [existente] = await this.db
        .select()
        .from(visitas)
        .where(eq(visitas.idCliente, idCliente))
        .limit(1);
      if (existente) return existente;
    }

    const [tienda] = await this.db
      .select()
      .from(tiendas)
      .where(and(eq(tiendas.id, tiendaId), eq(tiendas.activo, true)))
      .limit(1);

    if (!tienda) throw new NotFoundException("Tienda no encontrada o dada de baja");

    const zonaHoraria = await this.zonaHorariaDe(usuario.sub);
    const fecha = fechaLocal(new Date(), zonaHoraria);

    /**
     * Si la tienda ya está en la ruta del día, no se crea una visita extra: se
     * devuelve la planificada. El comercial que busca una tienda que ya tenía
     * asignada espera abrir esa, no duplicarla y descuadrar la cobertura.
     */
    const [yaExiste] = await this.db
      .select()
      .from(visitas)
      .where(
        and(
          eq(visitas.usuarioId, usuario.sub),
          eq(visitas.tiendaId, tiendaId),
          eq(visitas.fecha, fecha),
        ),
      )
      .limit(1);

    if (yaExiste) return yaExiste;

    /**
     * La visita se INCORPORA a la ruta del día (decisión que cierra P28).
     *
     * El GPV ve entonces una lista coherente de su jornada, con la tienda que
     * acaba de añadir entre las demás, en lugar de un apartado suelto.
     *
     * ⚠️ Pero conserva `planificada = false`. Si toda visita incorporada
     * contase como planificada, la cobertura saldría siempre al 100 % y la
     * métrica dejaría de medir nada. Son dos preguntas distintas —qué hay que
     * hacer hoy y qué estaba previsto— y ambas conservan respuesta.
     */
    const creada = await this.db.transaction(async (tx) => {
      // Se pone al final del rutero: es un añadido sobre lo ya planificado.
      const orden = await tx
        .select({ ultimo: sql<number>`coalesce(max(${rutasDiarias.ordenSugerido}), 0)` })
        .from(rutasDiarias)
        .where(
          and(eq(rutasDiarias.usuarioId, usuario.sub), eq(rutasDiarias.fecha, fecha)),
        );

      const [ruta] = await tx
        .insert(rutasDiarias)
        .values({
          usuarioId: usuario.sub,
          tiendaId,
          fecha,
          ordenSugerido: Number(orden[0]?.ultimo ?? 0) + 1,
        })
        .returning();

      const [visita] = await tx
        .insert(visitas)
        .values({
          usuarioId: usuario.sub,
          tiendaId,
          fecha,
          rutaDiariaId: ruta!.id,
          estado: "pendiente",
          planificada: false,
          idCliente: idCliente ?? null,
        })
        .returning();

      return visita!;
    });

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "visita.creada_no_planificada",
      entidad: "visita",
      entidadId: creada.id,
    });

    return creada;
  }

  /**
   * Comienza la visita: registra hora y geolocalización de check-in.
   *
   * La desviación respecto a la ubicación de la tienda se calcula y se guarda,
   * pero NO bloquea: el GPS falla dentro de edificios con demasiada frecuencia
   * como para convertirlo en un muro. Es una señal para el supervisor.
   */
  async comenzar(
    visitaId: string,
    usuario: PayloadToken,
    datos: { ubicacion?: Punto; capturadaEn?: Date },
  ) {
    const { visita, tienda } = await this.visitaPropia(visitaId, usuario);

    if (visita.estado !== "pendiente") {
      throw new ConflictException(
        `La visita no se puede comenzar: está en estado "${visita.estado}"`,
      );
    }

    const momento = datos.capturadaEn ?? new Date();
    const desviacion = evaluarDesviacion(datos.ubicacion, tienda.ubicacion);

    const [actualizada] = await this.db
      .update(visitas)
      .set({
        estado: "en_curso",
        horaInicio: momento,
        ubicacionInicio: datos.ubicacion ?? null,
      })
      .where(eq(visitas.id, visita.id))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "visita.comenzada",
      entidad: "visita",
      entidadId: visita.id,
      cambios: {
        estado: { antes: "pendiente", despues: "en_curso" },
        ...(desviacion.desviada
          ? { desviacionM: { antes: null, despues: desviacion.metros } }
          : {}),
      },
    });

    return { visita: actualizada!, desviacion };
  }

  /**
   * Finaliza la visita.
   *
   * **En el MVP no hay mínimos obligatorios** (SPECS §5.7): el GPV inicia y
   * cierra visitas libremente mientras el cliente define qué comportamientos
   * quiere exigir. Es una decisión consciente y temporal suya.
   *
   * Por eso `incompleta` ya NO se marca. El campo se conserva porque el propio
   * cliente anticipa definir esos mínimos más adelante, y borrarlo obligaría a
   * una migración para volver a añadirlo.
   *
   * Los ítems pendientes se siguen devolviendo: sirven para informar en el
   * resumen de cierre, que avisa sin bloquear.
   */
  async finalizar(
    visitaId: string,
    usuario: PayloadToken,
    datos: { ubicacion?: Punto; capturadaEn?: Date; notasLibres?: string },
  ) {
    const { visita, tienda } = await this.visitaPropia(visitaId, usuario);

    if (visita.estado !== "en_curso") {
      throw new ConflictException(
        `La visita no se puede finalizar: está en estado "${visita.estado}"`,
      );
    }

    const pendientes = await this.itemsObligatoriosPendientes(visita.id, tienda.tipoTiendaId);
    const momento = datos.capturadaEn ?? new Date();

    const [actualizada] = await this.db
      .update(visitas)
      .set({
        estado: "finalizada",
        horaFin: momento,
        ubicacionFin: datos.ubicacion ?? null,
        // Sin mínimos obligatorios, nada deja la visita incompleta.
        incompleta: false,
        notasLibres: datos.notasLibres ?? visita.notasLibres,
      })
      .where(eq(visitas.id, visita.id))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "visita.finalizada",
      entidad: "visita",
      entidadId: visita.id,
      cambios: {
        estado: { antes: "en_curso", despues: "finalizada" },
      },
    });

    return {
      visita: actualizada!,
      incompleta: false,
      /** Se devuelven para que la app pueda decir QUÉ quedó sin hacer. */
      itemsPendientes: pendientes
    };
  }

  /**
   * Ítems obligatorios del checklist sin completar.
   *
   * La plantilla se elige por tipo de tienda, con respaldo a la global. Si no
   * hubiera respaldo, una tienda de tipo nuevo se quedaría sin checklist y
   * toda visita a ella parecería completa.
   */
  private async itemsObligatoriosPendientes(
    visitaId: string,
    tipoTiendaId: string | null,
  ) {
    const [plantilla] = await this.db
      .select({ id: plantillasChecklist.id })
      .from(plantillasChecklist)
      .where(
        and(
          eq(plantillasChecklist.activo, true),
          tipoTiendaId
            ? or(
                eq(plantillasChecklist.tipoTiendaId, tipoTiendaId),
                isNull(plantillasChecklist.tipoTiendaId),
              )
            : isNull(plantillasChecklist.tipoTiendaId),
        ),
      )
      // La específica del tipo gana sobre la global.
      .orderBy(sql`${plantillasChecklist.tipoTiendaId} nulls last`)
      .limit(1);

    if (!plantilla) return [];

    const pendientes = await this.db
      .select({ id: itemsChecklist.id, texto: itemsChecklist.texto })
      .from(itemsChecklist)
      .leftJoin(
        resultadosChecklist,
        and(
          eq(resultadosChecklist.itemId, itemsChecklist.id),
          eq(resultadosChecklist.visitaId, visitaId),
        ),
      )
      .where(
        and(
          eq(itemsChecklist.plantillaId, plantilla.id),
          eq(itemsChecklist.obligatorio, true),
          eq(itemsChecklist.activo, true),
          or(
            isNull(resultadosChecklist.id),
            eq(resultadosChecklist.completado, false),
          ),
        ),
      );

    return pendientes.map((p) => ({ id: p.id, texto: p.texto }));
  }

  /**
   * Crea las filas de `visitas` que faltan para la ruta de hoy.
   *
   * Una ruta asignada no lleva visita hasta que alguien la crea, y sin fila no
   * hay `visitaId` que enviar: el comercial no podría justificar una tienda a
   * la que no ha ido, que es precisamente el caso que la justificación existe
   * para cubrir.
   *
   * Es idempotente por el `NOT EXISTS`, así que llamarla en cada carga de la
   * vista del día no duplica nada.
   *
   * Lo correcto a futuro es que el planificador del backoffice cree la visita
   * al asignar la ruta; entonces esto pasa a ser una red de seguridad para
   * rutas cargadas por otras vías (importación, seed, corrección manual).
   */
  private async materializarRuta(usuarioId: string, fecha: string) {
    const sinVisita = await this.db
      .select({ rutaId: rutasDiarias.id, tiendaId: rutasDiarias.tiendaId })
      .from(rutasDiarias)
      .where(
        and(
          eq(rutasDiarias.usuarioId, usuarioId),
          eq(rutasDiarias.fecha, fecha),
          sql`not exists (
            select 1 from ${visitas}
            where ${visitas.rutaDiariaId} = ${rutasDiarias.id}
          )`,
        ),
      );

    if (sinVisita.length === 0) return;

    /**
     * ADOPCIÓN antes que creación.
     *
     * El comercial pudo llegar a una tienda de su ruta por el buscador en
     * lugar de por la card —típico si abrió la app sin cobertura y la ruta
     * aún no se había materializado—, creando una visita "no planificada"
     * para una tienda que sí estaba asignada.
     *
     * Crear ahora una segunda visita dejaría dos tarjetas de la misma tienda
     * en la vista del día y contaría doble en los informes de cobertura. En su
     * lugar se adopta la existente: se enlaza con la ruta y se reclasifica
     * como planificada, que es lo que realmente era.
     */
    for (const ruta of sinVisita) {
      const adoptadas = await this.db
        .update(visitas)
        .set({ rutaDiariaId: ruta.rutaId, planificada: true })
        .where(
          and(
            eq(visitas.usuarioId, usuarioId),
            eq(visitas.tiendaId, ruta.tiendaId),
            eq(visitas.fecha, fecha),
            isNull(visitas.rutaDiariaId),
          ),
        )
        .returning({ id: visitas.id });

      if (adoptadas.length > 0) continue;

      await this.db
        .insert(visitas)
        .values({
          usuarioId,
          tiendaId: ruta.tiendaId,
          rutaDiariaId: ruta.rutaId,
          fecha,
          estado: "pendiente",
          planificada: true,
        })
        .onConflictDoNothing();
    }
  }

  /** Zona horaria del comercial, para resolver qué día es "hoy" para él. */
  async zonaHorariaDe(usuarioId: string): Promise<string> {
    const [fila] = await this.db
      .select({ zonaHoraria: zonas.zonaHoraria })
      .from(usuarios)
      .leftJoin(zonas, eq(zonas.id, usuarios.zonaId))
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    return (
      fila?.zonaHoraria ??
      this.config.get("ZONA_HORARIA_DEFECTO", { infer: true })
    );
  }

  /** Carga la visita comprobando que pertenece al comercial que la pide. */
  private async visitaPropia(visitaId: string, usuario: PayloadToken) {
    const [fila] = await this.db
      .select({ visita: visitas, tienda: tiendas })
      .from(visitas)
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .where(eq(visitas.id, visitaId))
      .limit(1);

    if (!fila) throw new NotFoundException("Visita no encontrada");
    if (fila.visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta visita no es tuya");
    }
    return fila;
  }

  private tarjeta(
    tienda: typeof tiendas.$inferSelect,
    visita: typeof visitas.$inferSelect | null,
    planificada: boolean,
    orden: number | null,
  ) {
    return {
      visitaId: visita?.id ?? null,
      tienda: {
        id: tienda.id,
        nombre: tienda.nombre,
        numeroReferencia: tienda.numeroReferencia,
        direccion: tienda.direccion,
        localidad: tienda.localidad,
      },
      estado: visita?.estado ?? "pendiente",
      planificada,
      ordenSugerido: orden,
      incompleta: visita?.incompleta ?? false,
      justificada: visita?.justificada ?? false,
      horaInicio: visita?.horaInicio ?? null,
      horaFin: visita?.horaFin ?? null,
    };
  }
}
