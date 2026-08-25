import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  categorias,
  evidencias,
  incidencias,
  tiendas,
  usuarios,
  visitas,
} from "@sw/db";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";

type Prioridad = "baja" | "media" | "alta" | "critica";
type EstadoIncidencia = "abierta" | "en_revision" | "resuelta" | "descartada";

/**
 * Transiciones permitidas del ciclo de vida de una incidencia.
 *
 * Se declara explícitamente en lugar de aceptar cualquier cambio: sin esto, un
 * supervisor podría reabrir una incidencia resuelta hace meses y descuadrar
 * los informes de un periodo ya cerrado.
 */
const TRANSICIONES: Record<EstadoIncidencia, EstadoIncidencia[]> = {
  abierta: ["en_revision", "resuelta", "descartada"],
  en_revision: ["resuelta", "descartada", "abierta"],
  resuelta: [],
  descartada: [],
};

@Injectable()
export class IncidenciasService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Catálogo de categorías activas, opcionalmente filtrado por tipo. */
  async categoriasDisponibles(tipo?: "incidencia" | "oportunidad") {
    return this.db
      .select()
      .from(categorias)
      .where(
        tipo
          ? and(eq(categorias.activo, true), eq(categorias.tipo, tipo))
          : eq(categorias.activo, true),
      )
      .orderBy(categorias.tipo, categorias.orden);
  }

  /**
   * Registra una incidencia u oportunidad durante la visita.
   *
   * La categoría se guarda por `id`, nunca por texto: si se guardara el texto,
   * renombrar una categoría reescribiría retroactivamente lo que reportaron
   * los comerciales (CONVENTIONS).
   */
  async crear(
    visitaId: string,
    usuario: PayloadToken,
    datos: {
      categoriaId: string;
      descripcion?: string;
      prioridad?: Prioridad;
      idCliente?: string;
    },
  ) {
    // Idempotencia offline.
    if (datos.idCliente) {
      const [existente] = await this.db
        .select()
        .from(incidencias)
        .where(eq(incidencias.idCliente, datos.idCliente))
        .limit(1);
      if (existente) return existente;
    }

    const visita = await this.visitaEditable(visitaId, usuario);

    const [categoria] = await this.db
      .select()
      .from(categorias)
      .where(and(eq(categorias.id, datos.categoriaId), eq(categorias.activo, true)))
      .limit(1);

    if (!categoria) {
      throw new BadRequestException("Categoría no válida o dada de baja");
    }

    const [creada] = await this.db
      .insert(incidencias)
      .values({
        visitaId: visita.id,
        categoriaId: categoria.id,
        descripcion: datos.descripcion?.trim() || null,
        /**
         * La prioridad por defecto viene del catálogo, pero el comercial puede
         * subirla o bajarla: es quien está delante del lineal y ve el contexto
         * que la categoría no captura.
         */
        prioridad: datos.prioridad ?? categoria.prioridadDefecto,
        estado: "abierta",
        idCliente: datos.idCliente ?? null,
      })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "incidencia.creada",
      entidad: "incidencia",
      entidadId: creada!.id,
      cambios: {
        categoria: { antes: null, despues: categoria.codigo },
        prioridad: { antes: null, despues: creada!.prioridad },
      },
    });

    return creada!;
  }

  /** Incidencias de una visita, con el recuento de fotos confirmadas. */
  async deLaVisita(visitaId: string, usuario: PayloadToken) {
    await this.visitaVisible(visitaId, usuario);

    return this.db
      .select({
        incidencia: incidencias,
        categoria: categorias,
        fotosConfirmadas: sql<number>`(
          select count(*)::int from ${evidencias}
          where ${evidencias.incidenciaId} = ${incidencias.id}
            and ${evidencias.confirmadaEn} is not null
        )`,
      })
      .from(incidencias)
      .innerJoin(categorias, eq(categorias.id, incidencias.categoriaId))
      .where(eq(incidencias.visitaId, visitaId))
      .orderBy(desc(incidencias.creadoEn));
  }

  /**
   * Bandeja del supervisor.
   *
   * Un supervisor solo ve las de su zona; un administrador, todas. Sin ese
   * filtro, la bandeja de un supervisor de Cataluña se llenaría de incidencias
   * vascas que no puede resolver.
   */
  async bandeja(
    usuario: PayloadToken,
    filtros: {
      estado?: EstadoIncidencia;
      prioridad?: Prioridad;
      tipo?: "incidencia" | "oportunidad";
      limite: number;
    },
  ) {
    const condiciones = [];

    if (usuario.rol === "supervisor") {
      if (!usuario.zonaId) return [];
      condiciones.push(eq(tiendas.zonaId, usuario.zonaId));
    }
    if (filtros.estado) condiciones.push(eq(incidencias.estado, filtros.estado));
    if (filtros.prioridad) condiciones.push(eq(incidencias.prioridad, filtros.prioridad));
    if (filtros.tipo) condiciones.push(eq(categorias.tipo, filtros.tipo));

    return this.db
      .select({
        incidencia: incidencias,
        categoria: categorias,
        tienda: {
          id: tiendas.id,
          nombre: tiendas.nombre,
          numeroReferencia: tiendas.numeroReferencia,
        },
        comercial: {
          id: usuarios.id,
          nombre: usuarios.nombre,
          numeroTrabajador: usuarios.numeroTrabajador,
        },
        fecha: visitas.fecha,
      })
      .from(incidencias)
      .innerJoin(categorias, eq(categorias.id, incidencias.categoriaId))
      .innerJoin(visitas, eq(visitas.id, incidencias.visitaId))
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(condiciones.length ? and(...condiciones) : undefined)
      /**
       * Las críticas primero. `prioridad` es un enum de Postgres cuyo orden
       * natural es el de declaración —baja, media, alta, critica—, así que
       * descendente pone lo urgente arriba sin necesidad de un CASE.
       */
      .orderBy(desc(incidencias.prioridad), desc(incidencias.creadoEn))
      .limit(filtros.limite);
  }

  /**
   * Cambia el estado de una incidencia (SPECS §6.2).
   *
   * Solo supervisores y administradores: la gestión posterior es trabajo de
   * backoffice, no de campo. El comercial reporta; otro decide qué hacer.
   */
  async cambiarEstado(
    incidenciaId: string,
    nuevoEstado: EstadoIncidencia,
    usuario: PayloadToken,
    datos: { asignadoA?: string; notaResolucion?: string },
  ) {
    const [fila] = await this.db
      .select({ incidencia: incidencias, zonaTienda: tiendas.zonaId })
      .from(incidencias)
      .innerJoin(visitas, eq(visitas.id, incidencias.visitaId))
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .where(eq(incidencias.id, incidenciaId))
      .limit(1);

    if (!fila) throw new NotFoundException("Incidencia no encontrada");

    if (
      usuario.rol === "supervisor" &&
      fila.zonaTienda !== usuario.zonaId
    ) {
      throw new ForbiddenException("Esta incidencia no es de tu zona");
    }

    const actual = fila.incidencia.estado as EstadoIncidencia;
    if (!TRANSICIONES[actual].includes(nuevoEstado)) {
      throw new ConflictException(
        `No se puede pasar de "${actual}" a "${nuevoEstado}"`,
      );
    }

    const esCierre = nuevoEstado === "resuelta" || nuevoEstado === "descartada";

    const [actualizada] = await this.db
      .update(incidencias)
      .set({
        estado: nuevoEstado,
        asignadoA: datos.asignadoA ?? fila.incidencia.asignadoA,
        notaResolucion: datos.notaResolucion ?? fila.incidencia.notaResolucion,
        resueltaEn: esCierre ? new Date() : null,
      })
      .where(eq(incidencias.id, incidenciaId))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "incidencia.estado_cambiado",
      entidad: "incidencia",
      entidadId: incidenciaId,
      cambios: { estado: { antes: actual, despues: nuevoEstado } },
    });

    return actualizada!;
  }

  /** Solo el comercial dueño y con la visita abierta puede añadir. */
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
      throw new ConflictException(
        "La visita está cerrada y no admite incidencias nuevas",
      );
    }
    return visita;
  }

  /** Para lectura: el comercial dueño, o cualquier supervisor/administrador. */
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
