import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { evidencias } from "@sw/db";
import { AlmacenamientoService } from "../almacenamiento/almacenamiento.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { Configuracion } from "../config/configuracion";

/**
 * Normalización de vídeo a 720p H.264/AAC (SPECS §8).
 *
 * ── Por qué hace falta ────────────────────────────────────────────────
 *
 * El dispositivo sube lo que su cámara produzca. En iOS eso es MP4/H.264, en
 * Android puede ser MP4 o WebM, y en algunos modelos QuickTime. **Safari no
 * reproduce WebM con fiabilidad**, así que sin normalizar, un FSM con iPhone no
 * podría ver el vídeo que grabó un GPV con Android — el peor fallo posible en
 * una evidencia: existe, ocupa espacio y no sirve.
 *
 * Y acota el almacenamiento: un vídeo de móvil a 1080p pesa varias veces lo que
 * el mismo a 720p, y 720p ya deja leer una etiqueta de producto.
 *
 * ── Por qué NO se hace al subir ───────────────────────────────────────
 *
 * Transcodificar un minuto de vídeo lleva segundos de CPU. Hacerlo dentro de la
 * petición de confirmación dejaría al GPV esperando en la tienda y bloquearía
 * un hilo de la API por cada subida. Va en una cola: el vídeo queda servible
 * desde que se confirma, y la normalización lo sustituye cuando le toca.
 *
 * ── Qué pasa si ffmpeg no está ────────────────────────────────────────
 *
 * El vídeo se conserva **tal cual**, servible, con `normalizadaEn` en null. Un
 * vídeo pesado es infinitamente mejor que ninguno, y el campo delata cuáles
 * quedaron sin procesar. Nunca se borra un original que no se ha podido
 * sustituir.
 */
@Injectable()
export class NormalizacionVideoService {
  private readonly logger = new Logger(NormalizacionVideoService.name);
  private ejecutando = false;
  /** Para no repetir el aviso de "ffmpeg no está" en cada pasada. */
  private avisadoSinFfmpeg = false;

  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly config: ConfigService<Configuracion, true>,
  ) {}

  /**
   * Cada diez minutos.
   *
   * Frecuente porque el FSM puede querer ver un vídeo el mismo día, y el coste
   * de una pasada vacía es una consulta indexada.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async ejecutarProgramada(): Promise<void> {
    await this.ejecutar();
  }

  async ejecutar(limite = 5): Promise<{
    procesados: number;
    normalizados: number;
    fallidos: number;
    omitidos: number;
  }> {
    // Una sola pasada a la vez: dos procesos de ffmpeg concurrentes sobre la
    // misma máquina compiten por CPU y ninguno termina antes.
    if (this.ejecutando) {
      return { procesados: 0, normalizados: 0, fallidos: 0, omitidos: 0 };
    }
    this.ejecutando = true;

    try {
      const maxIntentos = this.config.get("VIDEO_MAX_INTENTOS", { infer: true }) ?? 3;

      const pendientes = await this.db
        .select()
        .from(evidencias)
        .where(
          and(
            eq(evidencias.tipo, "video"),
            // Solo lo confirmado: una reserva sin subir no tiene qué procesar.
            sql`${evidencias.confirmadaEn} is not null`,
            isNull(evidencias.normalizadaEn),
            lt(evidencias.intentosNormalizacion, maxIntentos),
          ),
        )
        .limit(limite);

      if (pendientes.length === 0) {
        return { procesados: 0, normalizados: 0, fallidos: 0, omitidos: 0 };
      }

      if (!(await this.hayFfmpeg())) {
        if (!this.avisadoSinFfmpeg) {
          this.logger.warn(
            `ffmpeg no disponible (${this.binario}). ` +
              `${pendientes.length} vídeo(s) quedan sin normalizar, pero servibles.`,
          );
          this.avisadoSinFfmpeg = true;
        }
        return {
          procesados: 0,
          normalizados: 0,
          fallidos: 0,
          omitidos: pendientes.length,
        };
      }

      let normalizados = 0;
      let fallidos = 0;

      for (const video of pendientes) {
        // El intento se anota ANTES de procesar. Si el proceso muere a mitad
        // —se cae la API, se agota la memoria— el contador ya subió y el vídeo
        // no se reintenta eternamente.
        await this.db
          .update(evidencias)
          .set({ intentosNormalizacion: video.intentosNormalizacion + 1 })
          .where(eq(evidencias.id, video.id));

        try {
          await this.normalizar(video);
          normalizados++;
        } catch (error) {
          fallidos++;
          this.logger.error(
            `No se pudo normalizar la evidencia ${video.id} ` +
              `(intento ${video.intentosNormalizacion + 1}/${maxIntentos}): ` +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      this.logger.log(
        `Normalización: ${normalizados} vídeo(s) a ${this.altura}p, ${fallidos} fallido(s).`,
      );
      return {
        procesados: pendientes.length,
        normalizados,
        fallidos,
        omitidos: 0,
      };
    } finally {
      this.ejecutando = false;
    }
  }

  /**
   * Normaliza un vídeo y sustituye el original.
   *
   * ORDEN IMPORTANTE: se sube el normalizado a una clave NUEVA, se apunta la
   * fila a ella y solo entonces se borra el original. Si algo falla antes de
   * ese último paso, el original sigue en su sitio y la fila sigue apuntándolo.
   * Sustituir en la misma clave sería más simple y destruiría la evidencia en
   * cuanto ffmpeg produjera algo inservible.
   */
  private async normalizar(video: typeof evidencias.$inferSelect): Promise<void> {
    const carpeta = await mkdtemp(join(tmpdir(), "sw-video-"));

    try {
      const entrada = join(carpeta, "original");
      const salida = join(carpeta, "normalizado.mp4");

      await writeFile(entrada, await this.almacenamiento.descargar(video.claveAlmacenamiento));
      await this.ejecutarFfmpeg(entrada, salida);

      const normalizado = await readFile(salida);
      if (normalizado.length === 0) {
        throw new Error("ffmpeg produjo un fichero vacío");
      }

      const claveNueva = `${video.claveAlmacenamiento.replace(/\.[^.]+$/, "")}.${this.altura}p.mp4`;
      await this.almacenamiento.subir(claveNueva, normalizado, "video/mp4");

      const claveVieja = video.claveAlmacenamiento;

      await this.db
        .update(evidencias)
        .set({
          claveAlmacenamiento: claveNueva,
          tipoMime: "video/mp4",
          tamanoBytes: normalizado.length,
          altoPx: this.altura,
          normalizadaEn: new Date(),
        })
        .where(eq(evidencias.id, video.id));

      // Solo ahora. Si esto falla, queda un objeto huérfano que la purga
      // recogerá — mucho menos grave que perder la evidencia.
      await this.almacenamiento.borrar(claveVieja).catch((error: unknown) => {
        this.logger.warn(
          `Normalizada ${video.id} pero no se pudo borrar el original ${claveVieja}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      });

      this.logger.log(
        `Evidencia ${video.id}: ${Math.round(video.tamanoBytes / 1024)} KB → ` +
          `${Math.round(normalizado.length / 1024)} KB`,
      );
    } finally {
      await rm(carpeta, { recursive: true, force: true }).catch(() => {});
    }
  }

  private get binario(): string {
    return this.config.get("FFMPEG_BIN", { infer: true }) ?? "ffmpeg";
  }

  private get altura(): number {
    return this.config.get("VIDEO_ALTURA", { infer: true }) ?? 720;
  }

  /** Comprueba que el binario responde antes de intentar nada con él. */
  private async hayFfmpeg(): Promise<boolean> {
    return new Promise((listo) => {
      const proceso = spawn(this.binario, ["-version"], { stdio: "ignore" });
      proceso.on("error", () => listo(false));
      proceso.on("close", (codigo) => listo(codigo === 0));
    });
  }

  /**
   * Los parámetros de transcodificación.
   *
   * - `scale`: se limita la ALTURA y el ancho se calcula manteniendo la
   *   proporción; `-2` obliga a que salga par, que H.264 exige. Y `min(...)`
   *   evita reescalar hacia ARRIBA un vídeo que ya venía a menos de 720p, que
   *   solo añadiría peso sin añadir detalle.
   * - `faststart`: mueve el índice al principio del fichero para que el
   *   backoffice pueda empezar a reproducir sin descargarlo entero.
   * - **El audio se conserva.** El cliente pidió expresamente que los vídeos se
   *   oigan bien; eliminarlo para ahorrar espacio incumpliría el requisito.
   */
  private ejecutarFfmpeg(entrada: string, salida: string): Promise<void> {
    const argumentos = [
      "-y",
      "-i", entrada,
      "-vf", `scale=-2:'min(${this.altura},ih)'`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      salida,
    ];

    return new Promise((listo, fallo) => {
      const proceso = spawn(this.binario, argumentos, { stdio: ["ignore", "ignore", "pipe"] });

      // ffmpeg escribe TODO por stderr, también el progreso. Solo se guarda
      // para poder explicar un fallo; en el camino feliz se descarta.
      let traza = "";
      proceso.stderr?.on("data", (trozo: Buffer) => {
        traza = (traza + trozo.toString()).slice(-2000);
      });

      proceso.on("error", (error) => fallo(error));
      proceso.on("close", (codigo) => {
        if (codigo === 0) listo();
        else fallo(new Error(`ffmpeg salió con código ${codigo}: ${traza.trim().slice(-400)}`));
      });
    });
  }
}
