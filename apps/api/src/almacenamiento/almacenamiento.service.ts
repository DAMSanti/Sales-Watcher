import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Configuracion } from "../config/configuracion";

export type MetadatosObjeto = {
  tamanoBytes: number;
  tipoMime: string | undefined;
};

/**
 * Acceso al almacenamiento de objetos.
 *
 * Usa el cliente S3 estándar, no el SDK propietario de ningún proveedor: el
 * mismo código sirve para MinIO en local, S3, R2 o Spaces en producción, que
 * es el requisito que impone tener el hosting sin decidir (CONVENTIONS).
 */
@Injectable()
export class AlmacenamientoService {
  private readonly logger = new Logger(AlmacenamientoService.name);
  private readonly cliente: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<Configuracion, true>) {
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.cliente = new S3Client({
      endpoint: config.get("S3_ENDPOINT", { infer: true }),
      region: config.get("S3_REGION", { infer: true }),
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
      },
      /**
       * MinIO no soporta el estilo de host virtual (bucket.dominio), solo
       * rutas. S3 y R2 admiten ambos, así que forzarlo funciona en todas
       * partes y evita una variable de configuración más.
       */
      forcePathStyle: true,
    });
  }

  /**
   * Genera la clave de almacenamiento de una fotografía.
   *
   * El prefijo por fecha y visita no es decorativo: agrupa los objetos de la
   * misma jornada, lo que hace que un borrado por retención recorra un rango
   * contiguo en lugar de saltar por todo el bucket, y permite inspeccionar a
   * mano lo subido un día concreto.
   *
   * Termina en un UUID y no en el nombre original del fichero, que viene del
   * dispositivo y no es de fiar.
   */
  construirClave(visitaId: string, fecha: string, extension: string): string {
    const [anio, mes] = fecha.split("-");
    return `visitas/${anio}/${mes}/${visitaId}/${randomUUID()}.${extension}`;
  }

  /**
   * URL firmada para que el dispositivo suba directamente al almacenamiento.
   *
   * El fichero NO pasa por la API. Con cientos de visitas al día y varias
   * fotos por visita, proxiar las subidas convertiría la API en un cuello de
   * botella y obligaría a subir los límites de tamaño de petición.
   *
   * `ContentType` y `ContentLength` van dentro de la firma: el dispositivo no
   * puede subir un tipo distinto ni un fichero de otro tamaño sin invalidarla.
   */
  async urlDeSubida(
    clave: string,
    tipoMime: string,
    tamanoBytes: number,
    /** Caducidad a medida. El vídeo la necesita mucho mayor que la foto. */
    minutos?: number,
  ): Promise<string> {
    const comando = new PutObjectCommand({
      Bucket: this.bucket,
      Key: clave,
      ContentType: tipoMime,
      ContentLength: tamanoBytes,
    });

    // `config.get` está tipado como opcional en este proyecto, así que el
    // respaldo es el mismo valor por defecto que declara el esquema.
    const caducidad =
      minutos ?? this.config.get("URL_SUBIDA_MINUTOS", { infer: true }) ?? 15;

    return getSignedUrl(this.cliente, comando, { expiresIn: caducidad * 60 });
  }

  /**
   * Descarga un objeto a memoria.
   *
   * Lo usa la normalización de vídeo, que necesita el fichero en disco para
   * dárselo a ffmpeg. Para fotos no hace falta: nadie las procesa en servidor.
   */
  async descargar(clave: string): Promise<Buffer> {
    const respuesta = await this.cliente.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: clave }),
    );
    const trozos: Uint8Array[] = [];
    for await (const trozo of respuesta.Body as AsyncIterable<Uint8Array>) {
      trozos.push(trozo);
    }
    return Buffer.concat(trozos);
  }

  /** Sube un fichero desde el servidor. La usa la normalización de vídeo. */
  async subir(clave: string, contenido: Buffer, tipoMime: string): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        Body: contenido,
        ContentType: tipoMime,
      }),
    );
  }

  /**
   * URL firmada de descarga, de vida corta.
   *
   * Se genera al vuelo cada vez que alguien mira una foto. El bucket es
   * privado: sin URL firmada no hay acceso, ni siquiera conociendo la clave.
   */
  async urlDeDescarga(clave: string): Promise<string> {
    const comando = new GetObjectCommand({ Bucket: this.bucket, Key: clave });
    return getSignedUrl(this.cliente, comando, {
      expiresIn: this.config.get("URL_DESCARGA_MINUTOS", { infer: true }) * 60,
    });
  }

  /**
   * Comprueba que el objeto existe y devuelve su tamaño y tipo reales.
   *
   * Es el paso que impide dar por buena una foto que nunca llegó a subirse.
   * Sin él, un ítem de checklist que exige fotografía quedaría satisfecho por
   * una fila de base de datos apuntando a un objeto inexistente.
   */
  async metadatos(clave: string): Promise<MetadatosObjeto | null> {
    try {
      const respuesta = await this.cliente.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: clave }),
      );
      return {
        tamanoBytes: respuesta.ContentLength ?? 0,
        tipoMime: respuesta.ContentType,
      };
    } catch (error) {
      // Un 404 significa "no se subió", que es un resultado esperado, no un
      // error del sistema. Cualquier otra cosa sí merece propagarse.
      const codigo = (error as { name?: string; $metadata?: { httpStatusCode?: number } });
      if (codigo.name === "NotFound" || codigo.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async borrar(clave: string): Promise<void> {
    await this.cliente.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }),
    );
  }

  /**
   * Borrado por lotes, para el proceso de purga.
   *
   * Devuelve las claves que sí se borraron. Las que fallan se dejan fuera a
   * propósito para que su fila de base de datos sobreviva y el siguiente
   * pase vuelva a intentarlo: una fila huérfana es recuperable, un objeto sin
   * fila no lo es.
   */
  async borrarLote(claves: string[]): Promise<string[]> {
    if (claves.length === 0) return [];

    const borradas: string[] = [];

    // S3 admite 1000 objetos por petición.
    for (let i = 0; i < claves.length; i += 1000) {
      const trozo = claves.slice(i, i + 1000);
      try {
        const respuesta = await this.cliente.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: trozo.map((Key) => ({ Key })), Quiet: false },
          }),
        );
        for (const borrado of respuesta.Deleted ?? []) {
          if (borrado.Key) borradas.push(borrado.Key);
        }
        for (const fallo of respuesta.Errors ?? []) {
          this.logger.warn(`No se pudo borrar ${fallo.Key}: ${fallo.Message}`);
        }
      } catch (error) {
        this.logger.error(
          `Fallo borrando un lote de ${trozo.length} objetos`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return borradas;
  }
}
