import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  acciones,
  deteccionesFechas,
  deteccionesHueco,
  deteccionesStock,
  evidencias,
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
import { grupoSituacion } from "@sw/shared";
import { AlmacenamientoService } from "../almacenamiento/almacenamiento.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";

/**
 * Detalle de una visita para el backoffice (SPECS §6.2).
 *
 * Organizado **por categoría de producto**, no como una lista plana: es como
 * el GPV la registró y como el FSM la piensa. Una lista cronológica mezclaría
 * Dairy con Waters y obligaría a reconstruir mentalmente lo que la pantalla
 * puede agrupar.
 *
 * ── Lo que NO trae ────────────────────────────────────────────────────
 *
 * **La duración de la visita.** El cliente decidió no usar el tiempo de
 * permanencia como métrica ni como control mientras no se complete la revisión
 * legal (SPECS §6.2). Se muestran las horas de inicio y fin —son parte del
 * registro de la actividad— pero no el intervalo entre ellas, que es lo que se
 * acordó no exponer.
 */
@Injectable()
export class DetalleVisitaService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  async detalle(visitaId: string, usuario: PayloadToken) {
    const [cabecera] = await this.db
      .select({
        visita: visitas,
        tienda: tiendas,
        gpv: {
          id: usuarios.id,
          nombre: usuarios.nombre,
          numeroTrabajador: usuarios.numeroTrabajador,
        },
      })
      .from(visitas)
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(eq(visitas.id, visitaId))
      .limit(1);

    if (!cabecera) throw new NotFoundException("Visita no encontrada");

    // Un supervisor solo ve la actividad de su equipo.
    if (usuario.rol === "supervisor" && usuario.zonaId) {
      const [gpvDeLaZona] = await this.db
        .select({ zonaId: usuarios.zonaId })
        .from(usuarios)
        .where(eq(usuarios.id, cabecera.visita.usuarioId))
        .limit(1);
      if (gpvDeLaZona?.zonaId !== usuario.zonaId) {
        throw new ForbiddenException("Esta visita no es de tu zona");
      }
    }

    const registradas = await this.accionesConDetalle(visitaId);
    const [relacion] = await this.db
      .select()
      .from(relacionesResponsable)
      .where(eq(relacionesResponsable.visitaId, visitaId))
      .limit(1);

    /**
     * Las evidencias de ámbito visita, que no cuelgan de ninguna acción.
     * Las de acción viajan dentro de cada una.
     */
    const generales = await this.evidenciasDe({ visitaId, sinAccion: true });

    return {
      visita: {
        id: cabecera.visita.id,
        fecha: cabecera.visita.fecha,
        estado: cabecera.visita.estado,
        planificada: cabecera.visita.planificada,
        horaInicio: cabecera.visita.horaInicio,
        horaFin: cabecera.visita.horaFin,
        notasLibres: cabecera.visita.notasLibres,
        ubicacionInicio: cabecera.visita.ubicacionInicio,
      },
      tienda: {
        id: cabecera.tienda.id,
        nombre: cabecera.tienda.nombre,
        numeroReferencia: cabecera.tienda.numeroReferencia,
        localidad: cabecera.tienda.localidad,
        direccion: cabecera.tienda.direccion,
        canal: cabecera.tienda.canal,
      },
      gpv: cabecera.gpv,
      porCategoria: this.agrupar(registradas),
      relacionResponsable: relacion ?? null,
      evidenciasGenerales: generales,
    };
  }

  /**
   * Histórico de la relación con el responsable de una tienda (SPECS §5.6).
   *
   * Es lo que hace útil registrarla visita a visita: una valoración suelta no
   * dice nada, y la serie enseña si la relación mejora, se deteriora o depende
   * de quién visite.
   */
  async historicoResponsable(tiendaId: string, usuario: PayloadToken, limite = 24) {
    if (usuario.rol === "supervisor" && usuario.zonaId) {
      const [tienda] = await this.db
        .select({ zonaId: tiendas.zonaId })
        .from(tiendas)
        .where(eq(tiendas.id, tiendaId))
        .limit(1);
      if (!tienda) throw new NotFoundException("Tienda no encontrada");
      if (tienda.zonaId !== usuario.zonaId) {
        throw new ForbiddenException("Esta tienda no es de tu zona");
      }
    }

    return this.db
      .select({
        visitaId: visitas.id,
        fecha: visitas.fecha,
        haHablado: relacionesResponsable.haHablado,
        valoracion: relacionesResponsable.valoracion,
        cuestionPendiente: relacionesResponsable.cuestionPendiente,
        comentario: relacionesResponsable.comentario,
        gpv: usuarios.nombre,
      })
      .from(relacionesResponsable)
      .innerJoin(visitas, eq(visitas.id, relacionesResponsable.visitaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(eq(visitas.tiendaId, tiendaId))
      // De más reciente a más antigua: lo primero que se mira es cómo está hoy.
      .orderBy(asc(visitas.fecha))
      .limit(limite);
  }

  // ── Auxiliares ───────────────────────────────────────────────────────

  /**
   * Las acciones de la visita con su detalle tipificado y sus evidencias.
   *
   * Se traen los nueve detalles con `leftJoin` en una sola consulta en lugar de
   * una por tipo: son pocas filas por visita y nueve viajes de ida y vuelta por
   * cada visita abierta en el backoffice se notarían.
   */
  private async accionesConDetalle(visitaId: string) {
    const filas = await this.db
      .select({
        accion: acciones,
        stock: deteccionesStock,
        fechas: deteccionesFechas,
        hueco: deteccionesHueco,
        topPico: topPicosPendientes,
        referencia: { nombre: referenciasProducto.nombre },
        facings: gananciasFacings,
        visibilidad: oportunidadesVisibilidad,
        reorganizacion: oportunidadesReorganizacion,
        extraespacio: extraespacios,
        nevera: neveras,
        marca: { nombre: marcas.nombre },
      })
      .from(acciones)
      .leftJoin(deteccionesStock, eq(deteccionesStock.accionId, acciones.id))
      .leftJoin(deteccionesFechas, eq(deteccionesFechas.accionId, acciones.id))
      .leftJoin(deteccionesHueco, eq(deteccionesHueco.accionId, acciones.id))
      .leftJoin(topPicosPendientes, eq(topPicosPendientes.accionId, acciones.id))
      .leftJoin(referenciasProducto, eq(referenciasProducto.id, topPicosPendientes.referenciaId))
      .leftJoin(gananciasFacings, eq(gananciasFacings.accionId, acciones.id))
      .leftJoin(oportunidadesVisibilidad, eq(oportunidadesVisibilidad.accionId, acciones.id))
      .leftJoin(oportunidadesReorganizacion, eq(oportunidadesReorganizacion.accionId, acciones.id))
      .leftJoin(extraespacios, eq(extraespacios.accionId, acciones.id))
      .leftJoin(neveras, eq(neveras.extraespacioId, extraespacios.id))
      .leftJoin(
        marcas,
        // La marca puede venir de facings o de visibilidad, nunca de las dos.
        eq(marcas.id, gananciasFacings.marcaId),
      )
      .where(eq(acciones.visitaOrigenId, visitaId))
      .orderBy(asc(acciones.detectadaEn));

    if (filas.length === 0) return [];

    const porAccion = await this.evidenciasPorAccion(filas.map((f) => f.accion.id));

    return filas.map((f) => ({
      ...f.accion,
      grupo: grupoSituacion(f.accion.tipoSituacion),
      detalle: this.detalleDe(f),
      evidencias: porAccion.get(f.accion.id) ?? [],
    }));
  }

  /** Solo el detalle que corresponde al tipo; el resto de joins vienen nulos. */
  private detalleDe(f: {
    accion: { tipoSituacion: string };
    stock: typeof deteccionesStock.$inferSelect | null;
    fechas: typeof deteccionesFechas.$inferSelect | null;
    hueco: typeof deteccionesHueco.$inferSelect | null;
    topPico: typeof topPicosPendientes.$inferSelect | null;
    referencia: { nombre: string | null } | null;
    facings: typeof gananciasFacings.$inferSelect | null;
    visibilidad: typeof oportunidadesVisibilidad.$inferSelect | null;
    reorganizacion: typeof oportunidadesReorganizacion.$inferSelect | null;
    extraespacio: typeof extraespacios.$inferSelect | null;
    nevera: typeof neveras.$inferSelect | null;
    marca: { nombre: string | null } | null;
  }): Record<string, unknown> | null {
    switch (f.accion.tipoSituacion) {
      case "stock":
        return f.stock
          ? {
              suficiencia: f.stock.suficiencia,
              comunicadoAlResponsable: f.stock.comunicadoAlResponsable,
            }
          : null;
      case "fechas":
        return f.fechas ? { problema: f.fechas.problema, detalle: f.fechas.detalle } : null;
      case "hueco":
        return f.hueco
          ? {
              existeHueco: f.hueco.existeHueco,
              cubiertoConAdyacente: f.hueco.cubiertoConAdyacente,
              correccion: f.hueco.correccion,
            }
          : null;
      case "top_pico":
        return f.topPico
          ? {
              referencia: f.referencia?.nombre ?? null,
              incorporada: f.topPico.incorporada,
              incorporadaEn: f.topPico.incorporadaEn,
            }
          : null;
      case "facings":
        return f.facings
          ? {
              marca: f.marca?.nombre ?? null,
              conseguido: f.facings.conseguido,
              facingsGanados: f.facings.facingsGanados,
            }
          : null;
      case "visibilidad":
        return f.visibilidad
          ? {
              ubicacionActual: f.visibilidad.ubicacionActual,
              propuesta: f.visibilidad.propuesta,
            }
          : null;
      case "reorganizacion":
        return f.reorganizacion ? { propuesta: f.reorganizacion.propuesta } : null;
      case "extraespacio":
        return f.extraespacio
          ? { tipo: f.extraespacio.tipo, motivo: f.extraespacio.motivo }
          : null;
      case "nevera":
        return f.nevera
          ? {
              situacion: f.nevera.situacion,
              // El código va explícito: es lo que el FSM traslada a su propia
              // aplicación de neveras.
              codigoNevera: f.nevera.codigoNevera,
              motivo: f.extraespacio?.motivo ?? null,
            }
          : null;
      default:
        return null;
    }
  }

  /**
   * Evidencias confirmadas, con URL firmada de descarga.
   *
   * Solo las CONFIRMADAS: una reserva sin subir apunta a un objeto que no
   * existe, y enseñarla daría un hueco roto en la galería.
   *
   * Las URL se firman al vuelo y caducan pronto: el bucket es privado y una
   * URL de vida larga que se filtre da acceso saltándose la autenticación.
   */
  private async evidenciasDe(opciones: { visitaId: string; sinAccion?: boolean }) {
    const filas = await this.db
      .select()
      .from(evidencias)
      .where(
        and(
          eq(evidencias.visitaId, opciones.visitaId),
          ...(opciones.sinAccion ? [eq(evidencias.ambito, "visita")] : []),
        ),
      );

    return Promise.all(
      filas
        .filter((e) => e.confirmadaEn !== null)
        .map(async (e) => ({
          id: e.id,
          tipo: e.tipo,
          tipoMime: e.tipoMime,
          anchoPx: e.anchoPx,
          altoPx: e.altoPx,
          duracionS: e.duracionS,
          /** Null en un vídeo aún sin normalizar; el backoffice lo advierte. */
          normalizadaEn: e.normalizadaEn,
          capturadaEn: e.capturadaEn,
          url: await this.almacenamiento.urlDeDescarga(e.claveAlmacenamiento),
        })),
    );
  }

  private async evidenciasPorAccion(accionIds: string[]) {
    const mapa = new Map<string, Awaited<ReturnType<typeof this.evidenciasDe>>>();
    if (accionIds.length === 0) return mapa;

    const filas = await this.db
      .select()
      .from(evidencias)
      .where(inArray(evidencias.accionId, accionIds));

    for (const e of filas) {
      if (!e.confirmadaEn || !e.accionId) continue;
      const lista = mapa.get(e.accionId) ?? [];
      lista.push({
        id: e.id,
        tipo: e.tipo,
        tipoMime: e.tipoMime,
        anchoPx: e.anchoPx,
        altoPx: e.altoPx,
        duracionS: e.duracionS,
        normalizadaEn: e.normalizadaEn,
        capturadaEn: e.capturadaEn,
        url: await this.almacenamiento.urlDeDescarga(e.claveAlmacenamiento),
      });
      mapa.set(e.accionId, lista);
    }

    return mapa;
  }

  /** Agrupa por categoría de producto, con los extraespacios aparte. */
  private agrupar(registradas: Awaited<ReturnType<typeof this.accionesConDetalle>>) {
    const grupos: Record<string, typeof registradas> = {};

    for (const accion of registradas) {
      /**
       * Los extraespacios van a su propio bloque, fuera de las categorías,
       * igual que en el resumen del boceto. Colapsarlos dentro haría que «nos
       * han retirado la nevera» apareciese como oportunidad de Waters.
       */
      const clave =
        accion.grupo === "extraespacio" ? "extraespacios" : accion.categoriaProducto;
      grupos[clave] ??= [];
      grupos[clave]!.push(accion);
    }

    return grupos;
  }
}
