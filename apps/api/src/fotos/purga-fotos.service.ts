import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { fotos, operacionesSincronizadas } from "@sw/db";
import { AlmacenamientoService } from "../almacenamiento/almacenamiento.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { Configuracion } from "../config/configuracion";

/**
 * Purga de fotografías.
 *
 * Hace dos limpiezas distintas:
 *
 *  1. RETENCIÓN — fotos cuya `expiraEn` ya pasó. Hoy no se marca ninguna,
 *     porque el plazo de retención sigue sin decidirse por negocio (P7). El
 *     proceso existe igualmente: el plazo es un parámetro de configuración y
 *     el mecanismo es el trabajo. Cuando legal fije el número, esto empieza a
 *     borrar sin tocar código.
 *
 *  2. RESERVAS ABANDONADAS — filas cuya subida nunca se confirmó. El
 *     dispositivo sube directo al almacenamiento, así que una pérdida de
 *     cobertura a mitad deja una fila apuntando a un objeto que no existe, o
 *     un objeto subido que ninguna fila da por bueno. Sin esta limpieza se
 *     acumulan indefinidamente.
 */
@Injectable()
export class PurgaFotosService {
  private readonly logger = new Logger(PurgaFotosService.name);
  private ejecutando = false;

  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly config: ConfigService<Configuracion, true>,
  ) {}

  /**
   * De madrugada, cuando no hay comerciales en campo.
   *
   * Es una tarea de mantenimiento que compite por conexiones de base de datos
   * y ancho de banda; ejecutarla a media mañana ralentizaría las subidas de
   * quien está trabajando.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async ejecutarProgramada(): Promise<void> {
    await this.ejecutar();
  }

  async ejecutar(): Promise<{
    caducadas: number;
    abandonadas: number;
    operaciones: number;
  }> {
    /**
     * Guarda contra ejecuciones solapadas. Con varias instancias de la API el
     * cron dispararía en todas a la vez; esto solo cubre el solapamiento
     * dentro de un proceso. Cuando haya más de una instancia hará falta un
     * bloqueo compartido, por ejemplo un advisory lock de Postgres.
     */
    if (this.ejecutando) {
      this.logger.warn("Purga ya en curso, se omite esta ejecución");
      return { caducadas: 0, abandonadas: 0, operaciones: 0 };
    }
    this.ejecutando = true;

    try {
      const caducadas = await this.purgarCaducadas();
      const abandonadas = await this.purgarReservasAbandonadas();
      const operaciones = await this.purgarOperacionesAntiguas();

      if (caducadas > 0 || abandonadas > 0 || operaciones > 0) {
        this.logger.log(
          `Purga completada: ${caducadas} caducada(s), ${abandonadas} reserva(s) abandonada(s), ${operaciones} clave(s) de idempotencia`,
        );
      }

      return { caducadas, abandonadas, operaciones };
    } finally {
      this.ejecutando = false;
    }
  }

  /**
   * Claves de idempotencia de sincronización ya inservibles.
   *
   * Cada operación aplicada deja una fila, así que crecen al ritmo del trabajo
   * de campo: cientos de visitas al día por decenas de operaciones cada una.
   *
   * Treinta días es holgado. Su única función es reconocer el reintento de un
   * lote cuya respuesta se perdió, y un dispositivo que lleva un mes sin
   * sincronizar tiene un problema que esta tabla no resuelve.
   */
  private async purgarOperacionesAntiguas(): Promise<number> {
    const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const borradas = await this.db
      .delete(operacionesSincronizadas)
      .where(lte(operacionesSincronizadas.aplicadaEn, limite))
      .returning({ id: operacionesSincronizadas.id });
    return borradas.length;
  }

  /** Fotos confirmadas cuya fecha de expiración ya pasó. */
  private async purgarCaducadas(): Promise<number> {
    const candidatas = await this.db
      .select({ id: fotos.id, clave: fotos.claveAlmacenamiento })
      .from(fotos)
      .where(and(isNotNull(fotos.expiraEn), lte(fotos.expiraEn, new Date())))
      .limit(1000);

    return this.borrarCandidatas(candidatas);
  }

  /** Reservas de subida que nunca se confirmaron. */
  private async purgarReservasAbandonadas(): Promise<number> {
    const horas = this.config.get("FOTO_RESERVA_CADUCA_HORAS", { infer: true });
    const limite = new Date(Date.now() - horas * 60 * 60 * 1000);

    const candidatas = await this.db
      .select({ id: fotos.id, clave: fotos.claveAlmacenamiento })
      .from(fotos)
      .where(and(isNull(fotos.confirmadaEn), lte(fotos.creadoEn, limite)))
      .limit(1000);

    return this.borrarCandidatas(candidatas);
  }

  /**
   * Borra primero del almacenamiento y solo después de base de datos.
   *
   * EL ORDEN IMPORTA Y NO ES INTERCAMBIABLE. Si se borrase primero la fila,
   * un fallo al borrar el objeto lo dejaría huérfano para siempre: nadie
   * sabría que existe, seguiría ocupando espacio y, en el caso de la
   * retención, seguiría existiendo un dato personal que debía haberse
   * eliminado. Al revés, un fallo deja la fila viva y el siguiente pase lo
   * reintenta.
   *
   * Por eso solo se borran de base de datos las claves que el almacenamiento
   * confirma haber eliminado.
   */
  private async borrarCandidatas(
    candidatas: Array<{ id: string; clave: string }>,
  ): Promise<number> {
    if (candidatas.length === 0) return 0;

    const borradas = new Set(
      await this.almacenamiento.borrarLote(candidatas.map((c) => c.clave)),
    );

    const idsBorrados = candidatas
      .filter((c) => borradas.has(c.clave))
      .map((c) => c.id);

    if (idsBorrados.length === 0) return 0;

    await this.db.delete(fotos).where(inArray(fotos.id, idsBorrados));

    const fallidas = candidatas.length - idsBorrados.length;
    if (fallidas > 0) {
      this.logger.warn(
        `${fallidas} objeto(s) no se pudieron borrar; se reintentarán en el siguiente pase`,
      );
    }

    return idsBorrados.length;
  }
}
