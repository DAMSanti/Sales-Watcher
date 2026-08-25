import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { obtenerUbicacion } from "../comun/ubicacion";
import { comprimir } from "./comprimir";
import { subirFoto, type Destino } from "./subida";
import "./evidencias.css";

/**
 * Captura de fotografía (SPECS §5.4).
 *
 * `capture="environment"` abre la cámara trasera directamente en lugar del
 * selector de ficheros. Es deliberado: la especificación pide captura del
 * momento de la visita, no subida desde galería, y así se evita que se
 * adjunte una foto de otro día.
 *
 * No es infalible —en escritorio y en algunos navegadores el atributo se
 * ignora y aparece el selector—, pero los metadatos de fecha y ubicación que
 * viajan con la foto sí dejan constancia de cuándo se hizo de verdad.
 */
export function BotonEvidencia({
  destino,
  onSubida,
  deshabilitado,
  etiqueta,
}: {
  destino: Destino;
  onSubida: () => void | Promise<void>;
  deshabilitado?: boolean;
  etiqueta?: string;
}) {
  const { t } = useTranslation();
  const entrada = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alElegir(evento: ChangeEvent<HTMLInputElement>) {
    const fichero = evento.target.files?.[0];
    /** Se limpia el input para poder volver a elegir la MISMA foto. */
    evento.target.value = "";
    if (!fichero) return;

    setProcesando(true);
    setError(null);
    setAviso(null);

    try {
      const comprimida = await comprimir(fichero);

      /** La ubicación se pide en paralelo pero no bloquea: una foto sin
       *  coordenadas sigue siendo prueba de la visita. */
      const ubicacion = await obtenerUbicacion();

      const resultado = await subirFoto(comprimida, destino, ubicacion);

      setAviso(
        resultado.via === "subida"
          ? t("foto.subida", {
              kb: Math.round(comprimida.tamanoBytes / 1024),
            })
          : t("foto.guardada"),
      );

      await onSubida();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="foto">
      <input
        ref={entrada}
        type="file"
        accept="image/*"
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
        <span aria-hidden="true">📷</span>
        {procesando ? t("foto.procesando") : (etiqueta ?? t("foto.hacer"))}
      </button>

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
