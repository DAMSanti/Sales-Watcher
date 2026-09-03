import { useTranslation } from "react-i18next";

/**
 * Detalle tipificado de una acción y sus evidencias, compartido entre el
 * detalle de visita y la ficha de tienda (documento FSM §8.5: "el detalle
 * debe adaptarse al tipo de registro" — bloque de marca, nueva implantación,
 * SKU, hueco, nevera, evidencia).
 *
 * Vive aquí y no en cada pantalla porque el servidor ya resuelve el detalle
 * por tipo (`DetalleVisitaService.detalleDe`) en la misma forma para las dos
 * pantallas — duplicar el renderizado habría dado dos versiones que
 * divergirían con el tiempo.
 */

export type Evidencia = {
  id: string;
  tipo: "foto" | "video";
  tipoMime: string;
  duracionS: number | null;
  normalizadaEn: string | null;
  capturadaEn: string;
  url: string;
};

/** Los pares campo/valor del detalle tipificado de una acción, ya traducidos. */
export function DetalleFlujo({ detalle }: { detalle: Record<string, unknown> | null | undefined }) {
  const { t } = useTranslation();
  if (!detalle) return null;

  const entradas = Object.entries(detalle).filter(([, v]) => v !== null && v !== undefined);
  if (entradas.length === 0) return null;

  return (
    <dl className="detalle-flujo">
      {entradas.map(([campo, valor]) => (
        <div key={campo} className="detalle-flujo__par">
          <dt>{t(`detalleFlujo.${campo}`, { defaultValue: campo })}</dt>
          <dd className={campo === "codigoNevera" ? "codigo-nevera" : ""}>
            {campo === "codigoNevera" ? <code>{String(valor)}</code> : formatear(campo, valor, t)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Una evidencia: imagen o vídeo reproducible.
 *
 * El vídeo va con `controls` y `preload="metadata"`: sin lo segundo, abrir una
 * visita con cuatro vídeos descargaría decenas de megabytes que quizá nadie
 * llegue a ver.
 */
export function Evidencia({ evidencia }: { evidencia: Evidencia }) {
  const { t } = useTranslation();

  if (evidencia.tipo === "video") {
    return (
      <figure className="evidencia">
        <video className="evidencia__video" controls preload="metadata" src={evidencia.url} />
        <figcaption className="evidencia__pie">
          {evidencia.duracionS !== null && <span>{evidencia.duracionS} s</span>}
          {evidencia.normalizadaEn === null && (
            <span className="evidencia__aviso">{t("detalleVisita.sinNormalizar")}</span>
          )}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="evidencia">
      <a href={evidencia.url} target="_blank" rel="noreferrer">
        <img className="evidencia__imagen" src={evidencia.url} alt="" loading="lazy" />
      </a>
    </figure>
  );
}

/** Los valores del dominio se traducen; los booleanos se dicen en palabras. */
function formatear(
  campo: string,
  valor: unknown,
  t: (clave: string, opciones?: Record<string, unknown>) => string,
) {
  if (typeof valor === "boolean") return t(valor ? "comun.si" : "comun.no");
  if (typeof valor === "number") return String(valor);
  // Nueva implantación (v0.7): lista de nombres de marca, ya resueltos en servidor.
  if (Array.isArray(valor)) return valor.length > 0 ? valor.join(", ") : "—";

  const texto = String(valor);
  const claves: Record<string, string> = {
    suficiencia: "flujo.suficiencia",
    problema: "flujo.problemaFechas",
    correccion: "flujo.correccion",
    decision: "flujo.decisionNevera",
    tipo: "flujo.tipoExtraespacio",
    motivo: "flujo.motivoExtraespacio",
    ubicacionActual: "flujo.ubicacion",
    propuesta: "flujo.propuesta",
  };

  const prefijo = claves[campo];
  return prefijo ? t(`${prefijo}.${texto}`, { defaultValue: texto }) : texto;
}
