import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import { evidencias, visitas } from "@sw/db";
import { AlmacenamientoService } from "../almacenamiento/almacenamiento.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { Configuracion } from "../config/configuracion";
import type { PayloadToken } from "../auth/auth.service";

/**
 * Tipos de imagen aceptados, con su extensión.
 *
 * Lista blanca cerrada, no una comprobación de que empiece por `image/`. El
 * dispositivo declara el tipo y hay que poder confiar en que lo almacenado es
 * una imagen y no un SVG con script dentro, que el navegador ejecutaría al
 * abrirlo desde una URL firmada.
 */
const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  /**
   * Vídeo (SPECS §8).
   *
   * MP4 es lo que producen las cámaras nativas de iOS y Android, y lo que
   * reproduce cualquier navegador. WebM y QuickTime se aceptan porque algunos
   * dispositivos los generan; el servidor los normaliza a MP4 después.
   *
   * Aceptar formatos que luego no se pueden reproducir sería peor que
   * rechazarlos: el GPV creería haber documentado algo que nadie puede ver.
   */
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Un tipo MIME de vídeo, para decidir límites y normalización. */
function esVideo(tipoMime: string): boolean {
  return tipoMime.startsWith("video/");
}

export type SolicitudSubida = {
  visitaId: string;
  ambito: "visita" | "checklist" | "incidencia";
  resultadoChecklistId?: string | undefined;
  incidenciaId?: string | undefined;
  tipoMime: string;
  tamanoBytes: number;
  anchoPx?: number | undefined;
  altoPx?: number | undefined;
  /** Solo vídeo. El servidor la valida antes de dar la URL de subida. */
  duracionS?: number | undefined;
  capturadaEn: Date;
  ubicacion?: { lat: number; lon: number; precisionM: number; capturadoEn: string };
  /** Identificador generado en el dispositivo, para idempotencia offline. */
  idCliente?: string | undefined;
};

@Injectable()
export class EvidenciasService {
  private readonly logger = new Logger(EvidenciasService.name);

  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly config: ConfigService<Configuracion, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Reserva una fotografía y devuelve la URL firmada para subirla.
   *
   * La fila se crea antes de que el fichero exista, con `confirmadaEn` en
   * null. Hasta que el dispositivo confirme y el servidor verifique que el
   * objeto está realmente ahí, la foto no cuenta para nada.
   */
  async solicitarSubida(solicitud: SolicitudSubida, usuario: PayloadToken) {
    const extension = TIPOS_PERMITIDOS[solicitud.tipoMime];
    if (!extension) {
      throw new BadRequestException(
        `Tipo no admitido: ${solicitud.tipoMime}. ` +
          "Se aceptan JPEG, PNG y WebP en imagen, y MP4, MOV y WebM en vídeo.",
      );
    }

    const video = esVideo(solicitud.tipoMime);

    // Los límites son por tipo: un vídeo de 20 MB es normal y una foto de
    // 20 MB significa que la compresión del dispositivo no llegó a ejecutarse.
    const maximo = video
      ? this.config.get("EVIDENCIA_VIDEO_MAX_BYTES", { infer: true })
      : this.config.get("EVIDENCIA_FOTO_MAX_BYTES", { infer: true });

    if (solicitud.tamanoBytes > maximo) {
      throw new BadRequestException(
        `${video ? "El vídeo" : "La imagen"} supera el máximo de ` +
          `${Math.round(maximo / 1024 / 1024)} MB.`,
      );
    }

    if (video) {
      const tope = this.config.get("EVIDENCIA_VIDEO_MAX_SEGUNDOS", { infer: true });
      if (solicitud.duracionS === undefined) {
        throw new BadRequestException("Falta la duración del vídeo");
      }
      if (solicitud.duracionS > tope) {
        throw new BadRequestException(
          `El vídeo dura ${solicitud.duracionS} s y el máximo son ${tope} s.`,
        );
      }
    }

    const visita = await this.visitaEditable(solicitud.visitaId, usuario);

    /**
     * Idempotencia offline: si la cola reintenta una solicitud que sí llegó,
     * se devuelve la reserva existente en lugar de crear una segunda fila y
     * dejar un objeto huérfano en el almacenamiento.
     */
    if (solicitud.idCliente) {
      const [existente] = await this.db
        .select()
        .from(evidencias)
        .where(eq(evidencias.idCliente, solicitud.idCliente))
        .limit(1);

      if (existente) {
        return {
          evidenciaId: existente.id,
          tipo: existente.tipo,
          urlSubida: existente.confirmadaEn
            ? null
            : await this.almacenamiento.urlDeSubida(
                existente.claveAlmacenamiento,
                existente.tipoMime,
                existente.tamanoBytes,
              ),
          yaConfirmada: existente.confirmadaEn !== null,
        };
      }
    }

    const clave = this.almacenamiento.construirClave(
      visita.id,
      visita.fecha,
      extension,
    );

    const [creada] = await this.db
      .insert(evidencias)
      .values({
        visitaId: visita.id,
        ambito: solicitud.ambito,
        resultadoChecklistId: solicitud.resultadoChecklistId ?? null,
        incidenciaId: solicitud.incidenciaId ?? null,
        claveAlmacenamiento: clave,
        tipoMime: solicitud.tipoMime,
        tamanoBytes: solicitud.tamanoBytes,
        tipo: video ? "video" : "foto",
        anchoPx: solicitud.anchoPx ?? null,
        altoPx: solicitud.altoPx ?? null,
        duracionS: solicitud.duracionS ?? null,
        capturadaEn: solicitud.capturadaEn,
        ubicacion: solicitud.ubicacion ?? null,
        expiraEn: this.calcularExpiracion(),
        idCliente: solicitud.idCliente ?? null,
      })
      .returning();

    if (!creada) throw new BadRequestException("No se pudo reservar la fotografía");

    return {
      evidenciaId: creada.id,
      tipo: creada.tipo,
      urlSubida: await this.almacenamiento.urlDeSubida(
        clave,
        solicitud.tipoMime,
        solicitud.tamanoBytes,
        // Un vídeo tarda mucho más en subir por red móvil: con la caducidad de
        // foto, la URL expiraba a mitad de subida y el GPV perdía la grabación.
        video
          ? this.config.get("URL_SUBIDA_VIDEO_MINUTOS", { infer: true })
          : undefined,
      ),
      yaConfirmada: false,
    };
  }

  /**
   * Confirma que la subida terminó, verificándolo contra el almacenamiento.
   *
   * No se fía de que el cliente diga que subió: consulta el objeto y compara
   * tamaño y tipo con lo declarado al reservar. Si no cuadra, borra el objeto
   * y la reserva — un fichero que no es lo que dijo ser no debe quedarse
   * ocupando espacio ni figurar como prueba de una visita.
   */
  async confirmarSubida(evidenciaId: string, usuario: PayloadToken) {
    const [evidencia] = await this.db
      .select()
      .from(evidencias)
      .where(eq(evidencias.id, evidenciaId))
      .limit(1);

    if (!evidencia) throw new NotFoundException("Evidencia no encontrada");
    if (evidencia.confirmadaEn) return { confirmada: true, evidenciaId: evidencia.id };

    await this.visitaEditable(evidencia.visitaId, usuario);

    const metadatos = await this.almacenamiento.metadatos(evidencia.claveAlmacenamiento);
    if (!metadatos) {
      throw new BadRequestException(
        "La imagen no está en el almacenamiento. Vuelve a subirla.",
      );
    }

    const maximo =
      evidencia.tipo === "video"
        ? this.config.get("EVIDENCIA_VIDEO_MAX_BYTES", { infer: true })
        : this.config.get("EVIDENCIA_FOTO_MAX_BYTES", { infer: true });
    const tamanoIncorrecto =
      metadatos.tamanoBytes > maximo || metadatos.tamanoBytes !== evidencia.tamanoBytes;
    const tipoIncorrecto =
      metadatos.tipoMime !== undefined && metadatos.tipoMime !== evidencia.tipoMime;

    if (tamanoIncorrecto || tipoIncorrecto) {
      await this.almacenamiento.borrar(evidencia.claveAlmacenamiento).catch(() => {});
      await this.db.delete(evidencias).where(eq(evidencias.id, evidencia.id));
      throw new BadRequestException(
        "La imagen subida no coincide con lo declarado. Vuelve a intentarlo.",
      );
    }

    await this.db
      .update(evidencias)
      .set({ confirmadaEn: new Date() })
      .where(eq(evidencias.id, evidencia.id));

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "evidencia.subida",
      entidad: "foto",
      entidadId: evidencia.id,
    });

    return { confirmada: true, evidenciaId: evidencia.id };
  }

  /**
   * URL de descarga de una foto confirmada.
   *
   * Un comercial solo ve las suyas; supervisores y administradores ven todas,
   * que es justamente para lo que existe el backoffice.
   */
  async urlDeDescarga(evidenciaId: string, usuario: PayloadToken) {
    const [fila] = await this.db
      .select({ evidencia: evidencias, visita: visitas })
      .from(evidencias)
      .innerJoin(visitas, eq(visitas.id, evidencias.visitaId))
      .where(eq(evidencias.id, evidenciaId))
      .limit(1);

    if (!fila) throw new NotFoundException("Fotografía no encontrada");
    if (!fila.evidencia.confirmadaEn) {
      throw new NotFoundException("La fotografía aún no se ha subido");
    }

    if (usuario.rol === "comercial" && fila.visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta fotografía no es de una visita tuya");
    }

    return {
      url: await this.almacenamiento.urlDeDescarga(fila.evidencia.claveAlmacenamiento),
      expiraEnMinutos: this.config.get("URL_DESCARGA_MINUTOS", { infer: true }),
    };
  }

  /**
   * Fecha a partir de la cual la purga puede borrar la fotografía.
   *
   * Devuelve null mientras no haya política de retención definida, que es el
   * estado actual: la decisión sigue pospuesta por negocio (P7). El mecanismo
   * existe desde ya porque el plazo es un parámetro y el proceso es el
   * trabajo; cuando se fije, habrá que rellenar este campo retroactivamente
   * en las fotos ya acumuladas.
   */
  private calcularExpiracion(): Date | null {
    const dias = this.config.get("RETENCION_EVIDENCIAS_DIAS", { infer: true });
    if (dias === null || dias <= 0) return null;
    return new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  }

  /**
   * Comprueba que la visita admite fotos nuevas y que el usuario puede
   * añadirlas.
   *
   * Una visita finalizada o no realizada es inmutable: aceptar fotos después
   * del cierre destruiría el valor del registro como evidencia, que es
   * precisamente para lo que existe.
   */
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
      throw new ForbiddenException(
        "La visita está cerrada y no admite fotografías nuevas",
      );
    }

    return visita;
  }
}
