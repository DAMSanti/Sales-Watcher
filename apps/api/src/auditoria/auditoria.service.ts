import { Inject, Injectable, Logger } from "@nestjs/common";
import { auditoria } from "@sw/db";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";

export type EntradaAuditoria = {
  usuarioId?: string | null;
  numeroTrabajador?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  cambios?: Record<string, { antes: unknown; despues: unknown }> | undefined;
  ip?: string | undefined;
  agenteUsuario?: string | undefined;
};

/**
 * Registro de auditoría (SPECS §8).
 *
 * Su razón de ser es resolver disputas: cuando un supervisor cuestione una
 * justificación o el resultado de un checklist, esta tabla es la que responde.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(@Inject(SERVICIO_DB) private readonly db: ClienteDb) {}

  /**
   * Escribe una entrada de auditoría.
   *
   * NO propaga errores. Es deliberado: un fallo escribiendo la auditoría no
   * debe tumbar la operación que la originó — sería absurdo impedir que un
   * comercial finalice una visita porque el registro de auditoría está lleno.
   * El fallo se registra en el log para que sea visible en monitorización.
   *
   * La contrapartida es que la auditoría no es transaccionalmente perfecta. Es
   * la elección correcta aquí: sirve para reconstruir qué pasó, no como libro
   * contable.
   */
  async registrar(entrada: EntradaAuditoria): Promise<void> {
    try {
      await this.db.insert(auditoria).values({
        usuarioId: entrada.usuarioId ?? null,
        numeroTrabajador: entrada.numeroTrabajador ?? null,
        accion: entrada.accion,
        entidad: entrada.entidad,
        entidadId: entrada.entidadId ?? null,
        cambios: entrada.cambios ?? null,
        ip: entrada.ip ?? null,
        agenteUsuario: entrada.agenteUsuario ?? null,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la auditoría de "${entrada.accion}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
