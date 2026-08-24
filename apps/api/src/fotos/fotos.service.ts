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
import { fotos, visitas } from "@sw/db";
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
};

export type SolicitudSubida = {
  visitaId: string;
  ambito: "visita" | "checklist" | "incidencia";
  resultadoChecklistId?: string | undefined;
  incidenciaId?: string | undefined;
  tipoMime: string;
  tamanoBytes: number;
  capturadaEn: Date;
  ubicacion?: { lat: number; lon: number; precisionM: number; capturadoEn: string };
  /** Identificador generado en el dispositivo, para idempotencia offline. */
  idCliente?: string | undefined;
};

@Injectable()
export class FotosService {
  private readonly logger = new Logger(FotosService.name);

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
        `Tipo de imagen no admitido: ${solicitud.tipoMime}. Se aceptan JPEG, PNG y WebP.`,
      );
    }

    const maximo = this.config.get("FOTO_MAX_BYTES", { infer: true });
    if (solicitud.tamanoBytes > maximo) {
      throw new BadRequestException(
        `La imagen supera el máximo de ${Math.round(maximo / 1024 / 1024)} MB. ` +
          "Debe comprimirse en el dispositivo antes de subirla.",
      );
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
        .from(fotos)
        .where(eq(fotos.idCliente, solicitud.idCliente))
        .limit(1);

      if (existente) {
        return {
          fotoId: existente.id,
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
      .insert(fotos)
      .values({
        visitaId: visita.id,
        ambito: solicitud.ambito,
        resultadoChecklistId: solicitud.resultadoChecklistId ?? null,
        incidenciaId: solicitud.incidenciaId ?? null,
        claveAlmacenamiento: clave,
        tipoMime: solicitud.tipoMime,
        tamanoBytes: solicitud.tamanoBytes,
        capturadaEn: solicitud.capturadaEn,
        ubicacion: solicitud.ubicacion ?? null,
        expiraEn: this.calcularExpiracion(),
        idCliente: solicitud.idCliente ?? null,
      })
      .returning();

    if (!creada) throw new BadRequestException("No se pudo reservar la fotografía");

    return {
      fotoId: creada.id,
      urlSubida: await this.almacenamiento.urlDeSubida(
        clave,
        solicitud.tipoMime,
        solicitud.tamanoBytes,
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
  async confirmarSubida(fotoId: string, usuario: PayloadToken) {
    const [foto] = await this.db
      .select()
      .from(fotos)
      .where(eq(fotos.id, fotoId))
      .limit(1);

    if (!foto) throw new NotFoundException("Fotografía no encontrada");
    if (foto.confirmadaEn) return { confirmada: true, fotoId: foto.id };

    await this.visitaEditable(foto.visitaId, usuario);

    const metadatos = await this.almacenamiento.metadatos(foto.claveAlmacenamiento);
    if (!metadatos) {
      throw new BadRequestException(
        "La imagen no está en el almacenamiento. Vuelve a subirla.",
      );
    }

    const maximo = this.config.get("FOTO_MAX_BYTES", { infer: true });
    const tamanoIncorrecto =
      metadatos.tamanoBytes > maximo || metadatos.tamanoBytes !== foto.tamanoBytes;
    const tipoIncorrecto =
      metadatos.tipoMime !== undefined && metadatos.tipoMime !== foto.tipoMime;

    if (tamanoIncorrecto || tipoIncorrecto) {
      await this.almacenamiento.borrar(foto.claveAlmacenamiento).catch(() => {});
      await this.db.delete(fotos).where(eq(fotos.id, foto.id));
      throw new BadRequestException(
        "La imagen subida no coincide con lo declarado. Vuelve a intentarlo.",
      );
    }

    await this.db
      .update(fotos)
      .set({ confirmadaEn: new Date() })
      .where(eq(fotos.id, foto.id));

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "foto.subida",
      entidad: "foto",
      entidadId: foto.id,
    });

    return { confirmada: true, fotoId: foto.id };
  }

  /**
   * URL de descarga de una foto confirmada.
   *
   * Un comercial solo ve las suyas; supervisores y administradores ven todas,
   * que es justamente para lo que existe el backoffice.
   */
  async urlDeDescarga(fotoId: string, usuario: PayloadToken) {
    const [fila] = await this.db
      .select({ foto: fotos, visita: visitas })
      .from(fotos)
      .innerJoin(visitas, eq(visitas.id, fotos.visitaId))
      .where(eq(fotos.id, fotoId))
      .limit(1);

    if (!fila) throw new NotFoundException("Fotografía no encontrada");
    if (!fila.foto.confirmadaEn) {
      throw new NotFoundException("La fotografía aún no se ha subido");
    }

    if (usuario.rol === "comercial" && fila.visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta fotografía no es de una visita tuya");
    }

    return {
      url: await this.almacenamiento.urlDeDescarga(fila.foto.claveAlmacenamiento),
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
    const dias = this.config.get("RETENCION_FOTOS_DIAS", { infer: true });
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
