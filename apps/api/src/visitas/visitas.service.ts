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

    const noPlanificadas = await this.db
      .select({ tienda: tiendas, visita: visitas })
      .from(visitas)
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .where(
        and(
          eq(visitas.usuarioId, usuario.sub),
          eq(visitas.fecha, fecha),
          eq(visitas.planificada, false),
        ),
      );

    const tarjetas = [
      ...planificadas.map((f) => this.tarjeta(f.tienda, f.visita, true, f.orden)),
      ...noPlanificadas.map((f) => this.tarjeta(f.tienda, f.visita, false, null)),
    ];

    const finalizadas = tarjetas.filter((t) => t.estado === "finalizada").length;
    const noRealizadas = tarjetas.filter((t) => t.estado === "no_realizada").length;

    return {
      fecha,
      zonaHoraria,
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

    const [creada] = await this.db
      .insert(visitas)
      .values({
        usuarioId: usuario.sub,
        tiendaId,
        fecha,
        estado: "pendiente",
        planificada: false,
        idCliente: idCliente ?? null,
      })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "visita.creada_no_planificada",
      entidad: "visita",
      entidadId: creada!.id,
    });

    return creada!;
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
   * Se permite cerrar con ítems obligatorios sin completar: la visita queda
   * marcada como `incompleta` en vez de bloquearse. Hay razones legítimas —el
   * producto ya no está, la cámara falla— y bloquear al comercial por un
   * problema que no es suyo destruye la adopción (SPECS §5.4).
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
        incompleta: pendientes.length > 0,
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
        incompleta: { antes: false, despues: pendientes.length > 0 },
      },
    });

    return {
      visita: actualizada!,
      incompleta: pendientes.length > 0,
      /** Se devuelven para que la app pueda decir QUÉ quedó sin hacer. */
      itemsPendientes: pendientes,
      duracionMinutos: visita.horaInicio
        ? Math.round((momento.getTime() - visita.horaInicio.getTime()) / 60_000)
        : null,
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
