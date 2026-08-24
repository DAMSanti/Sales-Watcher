import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import { justificaciones, motivosNoRealizacion, visitas } from "@sw/db";
import { instanteCierreJornada, ventanaJustificacionAbierta } from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import { VisitasService } from "./visitas.service";
import type { Configuracion } from "../config/configuracion";
import type { PayloadToken } from "../auth/auth.service";

@Injectable()
export class JustificacionesService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly config: ConfigService<Configuracion, true>,
    private readonly auditoria: AuditoriaService,
    private readonly visitasService: VisitasService,
  ) {}

  /**
   * Justifica una visita planificada que no se realizó (SPECS §5.5).
   *
   * La ventana es diaria: se justifica antes de terminar la jornada, y no se
   * puede justificar el viernes una visita del martes.
   */
  async justificar(
    visitaId: string,
    usuario: PayloadToken,
    datos: {
      motivoId: string;
      comentario?: string;
      capturadaEn: Date;
      idCliente?: string;
    },
  ) {
    // Idempotencia offline: la cola puede reintentar un envío que sí llegó.
    if (datos.idCliente) {
      const [existente] = await this.db
        .select()
        .from(justificaciones)
        .where(eq(justificaciones.idCliente, datos.idCliente))
        .limit(1);
      if (existente) return existente;
    }

    const [visita] = await this.db
      .select()
      .from(visitas)
      .where(eq(visitas.id, visitaId))
      .limit(1);

    if (!visita) throw new NotFoundException("Visita no encontrada");
    if (visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta visita no es tuya");
    }

    /**
     * Solo se justifica lo que no se hizo. Una visita finalizada no necesita
     * justificación, y una en curso significa que el comercial está dentro de
     * la tienda: si quiere abandonarla, primero tendría que poder revertir el
     * check-in, que hoy no existe.
     */
    if (visita.estado === "finalizada") {
      throw new ConflictException("Una visita finalizada no se justifica");
    }
    if (visita.estado === "en_curso") {
      throw new ConflictException(
        "La visita está en curso. Finalízala en lugar de justificarla.",
      );
    }
    if (!visita.planificada) {
      throw new ConflictException(
        "Solo se justifican las visitas planificadas: una visita extra que no se hizo simplemente no se crea",
      );
    }

    // La justificación es inmutable, igual que la visita cerrada.
    const [yaJustificada] = await this.db
      .select()
      .from(justificaciones)
      .where(eq(justificaciones.visitaId, visitaId))
      .limit(1);

    if (yaJustificada) {
      throw new ConflictException("Esta visita ya está justificada");
    }

    const [motivo] = await this.db
      .select()
      .from(motivosNoRealizacion)
      .where(
        and(
          eq(motivosNoRealizacion.id, datos.motivoId),
          eq(motivosNoRealizacion.activo, true),
        ),
      )
      .limit(1);

    if (!motivo) throw new BadRequestException("Motivo no válido");

    const comentario = datos.comentario?.trim();
    if (motivo.requiereComentario && !comentario) {
      throw new BadRequestException(
        "Este motivo exige un comentario que explique lo ocurrido",
      );
    }

    /**
     * ⚠️ LA REGLA MÁS FÁCIL DE ROMPER DE TODO EL SISTEMA.
     *
     * La ventana se valida contra `capturadaEn`, que es la hora del
     * DISPOSITIVO, nunca contra la hora de llegada al servidor. El comercial
     * puede justificar a las 19:55 sin cobertura y que la cola no sincronice
     * hasta las 21:30; rechazar entonces sería castigarle por el fallo de red
     * que el modo offline existe precisamente para absorber.
     *
     * `recibidaEn` se guarda solo para auditoría, y si aparece en una
     * comparación de ventana, es un bug.
     */
    const zonaHoraria = await this.visitasService.zonaHorariaDe(usuario.sub);
    const horaCierre = this.config.get("CIERRE_JORNADA_HORA", { infer: true });

    if (
      !ventanaJustificacionAbierta(
        datos.capturadaEn,
        visita.fecha,
        zonaHoraria,
        horaCierre,
      )
    ) {
      const limite = instanteCierreJornada(visita.fecha, zonaHoraria, horaCierre);
      throw new ConflictException({
        mensaje:
          "El plazo para justificar esta visita terminó. Habla con tu supervisor.",
        cerroA: limite.toISOString(),
        capturadaEn: datos.capturadaEn.toISOString(),
      });
    }

    const creada = await this.db.transaction(async (tx) => {
      const [justificacion] = await tx
        .insert(justificaciones)
        .values({
          visitaId,
          motivoId: motivo.id,
          comentario: comentario ?? null,
          capturadaEn: datos.capturadaEn,
          idCliente: datos.idCliente ?? null,
        })
        .returning();

      /**
       * La visita pasa a `no_realizada` en la misma transacción. Separarlo
       * dejaría, ante un fallo, una justificación huérfana o una visita
       * cerrada sin motivo — los dos estados que el backoffice distingue.
       */
      await tx
        .update(visitas)
        .set({ estado: "no_realizada", justificada: true })
        .where(eq(visitas.id, visitaId));

      return justificacion!;
    });

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "visita.justificada",
      entidad: "visita",
      entidadId: visitaId,
      cambios: {
        estado: { antes: visita.estado, despues: "no_realizada" },
        motivo: { antes: null, despues: motivo.codigo },
      },
    });

    return creada;
  }

  /** Catálogo de motivos activos, resuelto al idioma del comercial. */
  async motivosDisponibles() {
    return this.db
      .select()
      .from(motivosNoRealizacion)
      .where(eq(motivosNoRealizacion.activo, true))
      .orderBy(motivosNoRealizacion.orden);
  }
}
