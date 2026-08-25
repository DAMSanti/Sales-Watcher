import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { obtenerUbicacion } from "../comun/ubicacion";
import { comprimir } from "./comprimir";
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SEGUNDOS,
  duracionDeVideo,
  subirFoto,
  subirVideo,
  type Destino,
} from "./subida";
import "./evidencias.css";

/**
 * Captura de evidencia: fotografía o vídeo (SPECS §5.4 y §8).
 *
 * `capture="environment"` abre la cámara trasera directamente en lugar del
 * selector de ficheros. Es deliberado: la especificación pide captura del
 * momento de la visita, no subida desde galería, y así se evita que se adjunte
 * material de otro día.
 *
 * No es infalible —en escritorio y en algunos navegadores el atributo se
 * ignora y aparece el selector—, pero los metadatos de fecha y ubicación que
 * viajan con la evidencia sí dejan constancia de cuándo se capturó de verdad.
 *
 * ── Por qué la cámara nativa y no MediaRecorder ───────────────────────
 *
 * `MediaRecorder` daría control sobre la duración y el bitrate, pero produce
 * WebM/VP9 en Chrome, y **Safari no lo reproduce con fiabilidad**: un FSM con
 * iPhone no podría ver lo que grabó un GPV con Android. La cámara nativa da
 * MP4/H.264 en ambas plataformas y con codificación por hardware, que además
 * no castiga la batería. Lo que se pierde —control del tamaño— se recupera
 * validando aquí y normalizando en el servidor.
 */
export function BotonEvidencia({
  destino,
  onSubida,
  deshabilitado,
  etiqueta,
  tipo = "foto",
}: {
  destino: Destino;
  onSubida: () => void | Promise<void>;
  deshabilitado?: boolean;
  etiqueta?: string;
  tipo?: "foto" | "video";
}) {
  const { t } = useTranslation();
  const entrada = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esVideo = tipo === "video";

  async function alElegir(evento: ChangeEvent<HTMLInputElement>) {
    const fichero = evento.target.files?.[0];
    /** Se limpia el input para poder volver a elegir el MISMO fichero. */
    evento.target.value = "";
    if (!fichero) return;

    setProcesando(true);
    setError(null);
    setAviso(null);

    try {
      /** La ubicación se pide pero no bloquea: una evidencia sin coordenadas
       *  sigue siendo prueba de la visita. */
      const ubicacion = await obtenerUbicacion();

      if (esVideo) {
        await capturarVideo(fichero, ubicacion);
      } else {
        const comprimida = await comprimir(fichero);
        const resultado = await subirFoto(comprimida, destino, ubicacion);
        setAviso(
          resultado.via === "subida"
            ? t("foto.subida", { kb: Math.round(comprimida.tamanoBytes / 1024) })
            : t("foto.guardada"),
        );
      }

      await onSubida();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Valida en el dispositivo ANTES de subir.
   *
   * Comprobarlo aquí evita gastarle al GPV 25 MB de datos móviles en algo que
   * el servidor va a rechazar, y le dice qué pasó estando aún en la tienda,
   * donde puede volver a grabarlo más corto.
   */
  async function capturarVideo(fichero: File, ubicacion?: Awaited<ReturnType<typeof obtenerUbicacion>>) {
    if (fichero.size > VIDEO_MAX_BYTES) {
      throw new Error(
        t("video.demasiadoGrande", {
          mb: Math.round(fichero.size / 1024 / 1024),
          max: Math.round(VIDEO_MAX_BYTES / 1024 / 1024),
        }),
      );
    }

    const duracion = await duracionDeVideo(fichero).catch(() => {
      // Si el navegador no sabe leer la duración, el servidor la exige y
      // rechazaría la reserva. Mejor decirlo aquí que gastar la subida.
      throw new Error(t("video.sinDuracion"));
    });

    if (duracion > VIDEO_MAX_SEGUNDOS) {
      throw new Error(
        t("video.demasiadoLargo", { s: duracion, max: VIDEO_MAX_SEGUNDOS }),
      );
    }

    if (!navigator.onLine) {
      /**
       * El vídeo NO se guarda para después.
       *
       * Guardar 25 MB por vídeo en IndexedDB llenaría el almacenamiento del
       * navegador en pocas grabaciones. Se avisa y el GPV lo reintenta al
       * salir de la tienda, que es donde recupera cobertura.
       */
      throw new Error(t("video.sinCobertura"));
    }

    await subirVideo(fichero, duracion, destino, ubicacion);
    setAviso(
      t("video.subido", {
        s: duracion,
        mb: (fichero.size / 1024 / 1024).toFixed(1),
      }),
    );
  }

  return (
    <div className="foto">
      <input
        ref={entrada}
        type="file"
        accept={esVideo ? "video/*" : "image/*"}
        capture="environment"
        onChange={(e) => void alElegir(e)}
        className="solo-lectores"
        aria-hidden="true"
        tabIndex={-1}
      />

      <button
        type="button"
        className="boton boton--secundario foto__boton"
        onClick={() => entrada.current?.click()}
        disabled={deshabilitado || procesando}
      >
        <span aria-hidden="true">{esVideo ? "\uD83C\uDFA5" : "\uD83D\uDCF7"}</span>
        {procesando
          ? t(esVideo ? "video.procesando" : "foto.procesando")
          : (etiqueta ?? t(esVideo ? "video.grabar" : "foto.hacer"))}
      </button>

      {/*
        Aviso de grabación de audio.

        El vídeo lleva sonido porque el cliente lo pidió expresamente, y eso
        puede recoger la voz del encargado. Decirlo en el momento es la
        mitigación más barata mientras P31 sigue abierta; añadirlo después,
        con vídeos ya grabados, sale mucho más caro.
      */}
      {esVideo && !procesando && (
        <p className="foto__aviso foto__aviso--sutil">{t("video.avisoAudio")}</p>
      )}

      {aviso && (
        <p className="foto__aviso" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="foto__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
