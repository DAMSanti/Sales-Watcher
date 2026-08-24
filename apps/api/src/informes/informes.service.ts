import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import {
  categorias,
  incidencias,
  itemsChecklist,
  justificaciones,
  motivosNoRealizacion,
  resultadosChecklist,
  rutasDiarias,
  tiendas,
  usuarios,
  visitas,
  zonas,
} from "@sw/db";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";

export type Filtros = {
  desde: string;
  hasta: string;
  zonaId?: string | undefined;
  usuarioId?: string | undefined;
  tiendaId?: string | undefined;
};

@Injectable()
export class InformesService {
  constructor(@Inject(SERVICIO_DB) private readonly db: ClienteDb) {}

  /**
   * Restricción por zona del solicitante.
   *
   * Un supervisor solo ve su zona; un administrador, todas. Se aplica sobre la
   * zona del COMERCIAL y no la de la tienda: una visita fuera de ruta a una
   * tienda de otra zona sigue siendo actividad de su equipo, y es a su equipo
   * a quien supervisa.
   */
  private ambito(usuario: PayloadToken, filtros: Filtros): SQL[] {
    const condiciones: SQL[] = [
      gte(visitas.fecha, filtros.desde),
      lte(visitas.fecha, filtros.hasta),
    ];

    if (usuario.rol === "supervisor" && usuario.zonaId) {
      condiciones.push(eq(usuarios.zonaId, usuario.zonaId));
    } else if (filtros.zonaId) {
      condiciones.push(eq(usuarios.zonaId, filtros.zonaId));
    }

    if (filtros.usuarioId) condiciones.push(eq(visitas.usuarioId, filtros.usuarioId));
    if (filtros.tiendaId) condiciones.push(eq(visitas.tiendaId, filtros.tiendaId));

    return condiciones;
  }

  /**
   * Estado del día (SPECS §6.2).
   *
   * Es la pantalla que el supervisor mira por la mañana y a media tarde, así
   * que responde a una sola pregunta: ¿cómo va hoy y qué necesita mi atención?
   */
  async dashboard(usuario: PayloadToken, fecha: string) {
    const filtros: Filtros = { desde: fecha, hasta: fecha };
    const ambito = this.ambito(usuario, filtros);

    const [estados] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        finalizadas: sql<number>`count(*) filter (where ${visitas.estado} = 'finalizada')::int`,
        enCurso: sql<number>`count(*) filter (where ${visitas.estado} = 'en_curso')::int`,
        pendientes: sql<number>`count(*) filter (where ${visitas.estado} = 'pendiente')::int`,
        noRealizadas: sql<number>`count(*) filter (where ${visitas.estado} = 'no_realizada')::int`,
        /**
         * Las no realizadas SIN justificar se cuentan aparte. Son el desenlace
         * peor y lo que el supervisor tiene que reclamar; mezclarlas con las
         * justificadas escondería exactamente lo que hay que mirar.
         */
        sinJustificar: sql<number>`count(*) filter (
          where ${visitas.estado} = 'no_realizada' and not ${visitas.justificada}
        )::int`,
        incompletas: sql<number>`count(*) filter (
          where ${visitas.estado} = 'finalizada' and ${visitas.incompleta}
        )::int`,
        noPlanificadas: sql<number>`count(*) filter (where not ${visitas.planificada})::int`,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(and(...ambito));

    /** Comerciales que han tocado la app hoy, no los que tienen ruta. */
    const [actividad] = await this.db
      .select({
        conActividad: sql<number>`count(distinct ${visitas.usuarioId}) filter (
          where ${visitas.estado} <> 'pendiente'
        )::int`,
        conRuta: sql<number>`count(distinct ${visitas.usuarioId})::int`,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(and(...ambito));

    const [abiertas] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        criticas: sql<number>`count(*) filter (where ${incidencias.prioridad} = 'critica')::int`,
        altas: sql<number>`count(*) filter (where ${incidencias.prioridad} = 'alta')::int`,
      })
      .from(incidencias)
      .innerJoin(visitas, eq(visitas.id, incidencias.visitaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(
        and(
          ...this.ambito(usuario, { desde: fecha, hasta: fecha }),
          sql`${incidencias.estado} in ('abierta', 'en_revision')`,
        ),
      );

    return {
      fecha,
      visitas: estados,
      comerciales: actividad,
      incidenciasAbiertas: abiertas,
    };
  }

  /**
   * Cobertura: lo hecho frente a lo asignado (SPECS §6.3).
   *
   * El denominador sale de `rutas_diarias`, no de `visitas`. Es la diferencia
   * entre "qué se planificó" y "qué llegó a existir como visita": si alguna
   * ruta no se materializó, contar sobre visitas inflaría la cobertura al
   * hacer desaparecer del denominador justo lo que no se hizo.
   */
  async cobertura(usuario: PayloadToken, filtros: Filtros) {
    const condiciones: SQL[] = [
      gte(rutasDiarias.fecha, filtros.desde),
      lte(rutasDiarias.fecha, filtros.hasta),
    ];

    if (usuario.rol === "supervisor" && usuario.zonaId) {
      condiciones.push(eq(usuarios.zonaId, usuario.zonaId));
    } else if (filtros.zonaId) {
      condiciones.push(eq(usuarios.zonaId, filtros.zonaId));
    }
    if (filtros.usuarioId) condiciones.push(eq(rutasDiarias.usuarioId, filtros.usuarioId));

    const porZona = await this.db
      .select({
        zonaId: zonas.id,
        zonaCodigo: zonas.codigo,
        planificadas: sql<number>`count(*)::int`,
        realizadas: sql<number>`count(*) filter (where ${visitas.estado} = 'finalizada')::int`,
        noRealizadas: sql<number>`count(*) filter (where ${visitas.estado} = 'no_realizada')::int`,
        sinJustificar: sql<number>`count(*) filter (
          where ${visitas.estado} = 'no_realizada' and not ${visitas.justificada}
        )::int`,
      })
      .from(rutasDiarias)
      .innerJoin(usuarios, eq(usuarios.id, rutasDiarias.usuarioId))
      .leftJoin(zonas, eq(zonas.id, usuarios.zonaId))
      .leftJoin(visitas, eq(visitas.rutaDiariaId, rutasDiarias.id))
      .where(and(...condiciones))
      .groupBy(zonas.id, zonas.codigo)
      .orderBy(zonas.codigo);

    const porComercial = await this.db
      .select({
        usuarioId: usuarios.id,
        numeroTrabajador: usuarios.numeroTrabajador,
        nombre: usuarios.nombre,
        zonaCodigo: zonas.codigo,
        planificadas: sql<number>`count(*)::int`,
        realizadas: sql<number>`count(*) filter (where ${visitas.estado} = 'finalizada')::int`,
        noRealizadas: sql<number>`count(*) filter (where ${visitas.estado} = 'no_realizada')::int`,
        sinJustificar: sql<number>`count(*) filter (
          where ${visitas.estado} = 'no_realizada' and not ${visitas.justificada}
        )::int`,
      })
      .from(rutasDiarias)
      .innerJoin(usuarios, eq(usuarios.id, rutasDiarias.usuarioId))
      .leftJoin(zonas, eq(zonas.id, usuarios.zonaId))
      .leftJoin(visitas, eq(visitas.rutaDiariaId, rutasDiarias.id))
      .where(and(...condiciones))
      .groupBy(usuarios.id, usuarios.numeroTrabajador, usuarios.nombre, zonas.codigo)
      .orderBy(usuarios.numeroTrabajador);

    /** Visitas fuera de ruta: no tienen denominador, se informan aparte. */
    const [extra] = await this.db
      .select({ noPlanificadas: sql<number>`count(*)::int` })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(
        and(...this.ambito(usuario, filtros), eq(visitas.planificada, false)),
      );

    return {
      periodo: { desde: filtros.desde, hasta: filtros.hasta },
      porZona: porZona.map(conPorcentaje),
      porComercial: porComercial.map(conPorcentaje),
      visitasNoPlanificadas: extra?.noPlanificadas ?? 0,
    };
  }

  /**
   * Desglose de no realización por motivo.
   *
   * Es la métrica que revela si el catálogo sirve para algo: si la mayoría de
   * las justificaciones caen en un solo motivo —"falta de tiempo" es el
   * sumidero natural—, el catálogo no está midiendo nada y hay que
   * desglosarlo (ANEXO §3).
   */
  async noRealizacion(usuario: PayloadToken, filtros: Filtros) {
    const ambito = this.ambito(usuario, filtros);

    const porMotivo = await this.db
      .select({
        motivoId: motivosNoRealizacion.id,
        codigo: motivosNoRealizacion.codigo,
        texto: motivosNoRealizacion.texto,
        total: sql<number>`count(*)::int`,
        aceptadas: sql<number>`count(*) filter (
          where ${justificaciones.estadoRevision} = 'aceptada'
        )::int`,
        cuestionadas: sql<number>`count(*) filter (
          where ${justificaciones.estadoRevision} = 'cuestionada'
        )::int`,
        pendientesRevision: sql<number>`count(*) filter (
          where ${justificaciones.estadoRevision} = 'pendiente'
        )::int`,
      })
      .from(justificaciones)
      .innerJoin(visitas, eq(visitas.id, justificaciones.visitaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(
        motivosNoRealizacion,
        eq(motivosNoRealizacion.id, justificaciones.motivoId),
      )
      .where(and(...ambito))
      .groupBy(motivosNoRealizacion.id, motivosNoRealizacion.codigo, motivosNoRealizacion.texto)
      .orderBy(sql`count(*) desc`);

    const [resumen] = await this.db
      .select({
        planificadas: sql<number>`count(*) filter (where ${visitas.planificada})::int`,
        noRealizadas: sql<number>`count(*) filter (
          where ${visitas.estado} = 'no_realizada'
        )::int`,
        justificadas: sql<number>`count(*) filter (
          where ${visitas.estado} = 'no_realizada' and ${visitas.justificada}
        )::int`,
        sinJustificar: sql<number>`count(*) filter (
          where ${visitas.estado} = 'no_realizada' and not ${visitas.justificada}
        )::int`,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(and(...ambito));

    const totalMotivos = porMotivo.reduce((suma, m) => suma + m.total, 0);

    return {
      periodo: { desde: filtros.desde, hasta: filtros.hasta },
      resumen: {
        ...resumen,
        tasaNoRealizacion: porcentaje(resumen?.noRealizadas, resumen?.planificadas),
      },
      porMotivo: porMotivo.map((m) => ({
        ...m,
        porcentaje: porcentaje(m.total, totalMotivos),
      })),
      /**
       * Señal explícita para el piloto: si un solo motivo se lleva más de la
       * mitad, el catálogo está funcionando como trámite y no como medida.
       */
      concentracion: porMotivo[0]
        ? {
            motivoDominante: porMotivo[0].codigo,
            porcentaje: porcentaje(porMotivo[0].total, totalMotivos),
            revisarCatalogo: porcentaje(porMotivo[0].total, totalMotivos) > 50,
          }
        : null,
    };
  }

  /** Cumplimiento de checklist y duración media (SPECS §6.3). */
  async ejecucion(usuario: PayloadToken, filtros: Filtros) {
    const ambito = this.ambito(usuario, filtros);

    const [checklist] = await this.db
      .select({
        itemsEvaluados: sql<number>`count(*)::int`,
        completados: sql<number>`count(*) filter (where ${resultadosChecklist.completado})::int`,
        obligatoriosEvaluados: sql<number>`count(*) filter (where ${itemsChecklist.obligatorio})::int`,
        obligatoriosCompletados: sql<number>`count(*) filter (
          where ${itemsChecklist.obligatorio} and ${resultadosChecklist.completado}
        )::int`,
      })
      .from(resultadosChecklist)
      .innerJoin(visitas, eq(visitas.id, resultadosChecklist.visitaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(itemsChecklist, eq(itemsChecklist.id, resultadosChecklist.itemId))
      .where(and(...ambito, eq(visitas.estado, "finalizada")));

    /**
     * La duración solo tiene sentido en visitas cerradas con las dos marcas.
     * Se filtran las de más de ocho horas: son un check-out olvidado, no una
     * visita larga, y una sola arrastraría la media del equipo entero.
     */
    const [duracion] = await this.db
      .select({
        visitasMedidas: sql<number>`count(*)::int`,
        mediaMinutos: sql<number>`coalesce(round(avg(
          extract(epoch from (${visitas.horaFin} - ${visitas.horaInicio})) / 60
        ))::int, 0)`,
        medianaMinutos: sql<number>`coalesce(round(
          percentile_cont(0.5) within group (
            order by extract(epoch from (${visitas.horaFin} - ${visitas.horaInicio})) / 60
          )
        )::int, 0)`,
        descartadas: sql<number>`0::int`,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(
        and(
          ...ambito,
          eq(visitas.estado, "finalizada"),
          sql`${visitas.horaInicio} is not null and ${visitas.horaFin} is not null`,
          sql`${visitas.horaFin} - ${visitas.horaInicio} between interval '0 minutes' and interval '8 hours'`,
        ),
      );

    const [incompletas] = await this.db
      .select({
        finalizadas: sql<number>`count(*)::int`,
        incompletas: sql<number>`count(*) filter (where ${visitas.incompleta})::int`,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(and(...ambito, eq(visitas.estado, "finalizada")));

    return {
      periodo: { desde: filtros.desde, hasta: filtros.hasta },
      checklist: {
        ...checklist,
        tasaCumplimiento: porcentaje(checklist?.completados, checklist?.itemsEvaluados),
        tasaObligatorios: porcentaje(
          checklist?.obligatoriosCompletados,
          checklist?.obligatoriosEvaluados,
        ),
      },
      duracion,
      visitasIncompletas: {
        ...incompletas,
        tasa: porcentaje(incompletas?.incompletas, incompletas?.finalizadas),
      },
    };
  }

  /** Incidencias por categoría, tipo y estado. */
  async informeIncidencias(usuario: PayloadToken, filtros: Filtros) {
    const ambito = this.ambito(usuario, filtros);

    const porCategoria = await this.db
      .select({
        codigo: categorias.codigo,
        nombre: categorias.nombre,
        tipo: categorias.tipo,
        total: sql<number>`count(*)::int`,
        abiertas: sql<number>`count(*) filter (where ${incidencias.estado} = 'abierta')::int`,
        enRevision: sql<number>`count(*) filter (where ${incidencias.estado} = 'en_revision')::int`,
        resueltas: sql<number>`count(*) filter (where ${incidencias.estado} = 'resuelta')::int`,
        criticas: sql<number>`count(*) filter (where ${incidencias.prioridad} = 'critica')::int`,
      })
      .from(incidencias)
      .innerJoin(visitas, eq(visitas.id, incidencias.visitaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(categorias, eq(categorias.id, incidencias.categoriaId))
      .where(and(...ambito))
      .groupBy(categorias.codigo, categorias.nombre, categorias.tipo)
      .orderBy(sql`count(*) desc`);

    /** Tiendas que acumulan incidencias: donde conviene mirar de cerca. */
    const porTienda = await this.db
      .select({
        numeroReferencia: tiendas.numeroReferencia,
        nombre: tiendas.nombre,
        total: sql<number>`count(*)::int`,
        abiertas: sql<number>`count(*) filter (
          where ${incidencias.estado} in ('abierta', 'en_revision')
        )::int`,
      })
      .from(incidencias)
      .innerJoin(visitas, eq(visitas.id, incidencias.visitaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .where(and(...ambito))
      .groupBy(tiendas.numeroReferencia, tiendas.nombre)
      .orderBy(sql`count(*) desc`)
      .limit(20);

    return {
      periodo: { desde: filtros.desde, hasta: filtros.hasta },
      porCategoria,
      tiendasConMasIncidencias: porTienda,
    };
  }

  /**
   * Bandeja de justificaciones (SPECS §6.2).
   *
   * Incluye las visitas no realizadas SIN justificación, que no tienen fila en
   * `justificaciones` y desaparecerían de un listado construido sobre esa
   * tabla. Son precisamente las que el supervisor tiene que reclamar.
   */
  async bandejaJustificaciones(
    usuario: PayloadToken,
    filtros: Filtros,
    soloPendientes: boolean,
  ) {
    const condiciones = [
      ...this.ambito(usuario, filtros),
      eq(visitas.estado, "no_realizada"),
    ];

    if (soloPendientes) {
      condiciones.push(
        sql`(${justificaciones.id} is null or ${justificaciones.estadoRevision} = 'pendiente')`,
      );
    }

    return this.db
      .select({
        visitaId: visitas.id,
        fecha: visitas.fecha,
        justificada: visitas.justificada,
        motivo: motivosNoRealizacion.texto,
        motivoCodigo: motivosNoRealizacion.codigo,
        comentario: justificaciones.comentario,
        capturadaEn: justificaciones.capturadaEn,
        estadoRevision: justificaciones.estadoRevision,
        justificacionId: justificaciones.id,
        tienda: {
          nombre: tiendas.nombre,
          numeroReferencia: tiendas.numeroReferencia,
        },
        comercial: {
          nombre: usuarios.nombre,
          numeroTrabajador: usuarios.numeroTrabajador,
        },
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .leftJoin(justificaciones, eq(justificaciones.visitaId, visitas.id))
      .leftJoin(
        motivosNoRealizacion,
        eq(motivosNoRealizacion.id, justificaciones.motivoId),
      )
      .where(and(...condiciones))
      /** Las sin justificar primero: son las que exigen acción. */
      .orderBy(visitas.justificada, sql`${visitas.fecha} desc`)
      .limit(200);
  }
}

function porcentaje(parte: number | undefined, total: number | undefined): number {
  if (!total || total === 0) return 0;
  return Math.round(((parte ?? 0) / total) * 1000) / 10;
}

function conPorcentaje<T extends { realizadas: number; planificadas: number }>(fila: T) {
  return { ...fila, cobertura: porcentaje(fila.realizadas, fila.planificadas) };
}
