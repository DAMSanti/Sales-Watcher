import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOCALE, type Idioma } from "@sw/shared";
import { pedir } from "../api/cliente";
import { guardarCache, leerCache } from "../offline/almacen";

type Contexto = {
  anterior: {
    id: string;
    fecha: string;
    incompleta: boolean;
    notasLibres: string | null;
    comercial: string;
  } | null;
  incidenciasAbiertas: Array<{
    id: string;
    prioridad: "baja" | "media" | "alta" | "critica";
    categoria: string;
    tipo: string;
    descripcion: string | null;
    fecha: string;
  }>;
};

/**
 * Qué pasó la última vez en esta tienda (SPECS §5.4).
 *
 * Da continuidad a la visita: el comercial entra sabiendo qué quedó abierto y
 * evita reportar por tercera vez una rotura de stock que ya está en la bandeja
 * del supervisor sin resolver.
 *
 * Se pide aparte del resto de la pantalla y no bloquea nada: es información
 * útil, no imprescindible para empezar a trabajar.
 */
export function ContextoAnterior({
  visitaId,
  idioma,
}: {
  visitaId: string;
  idioma: Idioma;
}) {
  const { t } = useTranslation();
  const [contexto, setContexto] = useState<Contexto | null>(null);

  useEffect(() => {
    let vigente = true;
    const clave = `contexto/${visitaId}`;

    pedir<Contexto>(`/visitas/${visitaId}/contexto`, { idioma })
      .then((datos) => {
        if (!vigente) return;
        setContexto(datos);
        void guardarCache(clave, datos);
      })
      .catch(async () => {
        /** Sin cobertura, lo último descargado. Si no hay nada, no se pinta. */
        const guardado = await leerCache<Contexto>(clave);
        if (vigente && guardado) setContexto(guardado.datos);
      });

    return () => {
      vigente = false;
    };
  }, [visitaId, idioma]);

  if (!contexto) return null;

  const { anterior, incidenciasAbiertas } = contexto;
  /** Primera visita a esta tienda y nada abierto: no hay nada que contar. */
  if (!anterior && incidenciasAbiertas.length === 0) return null;

  return (
    <section className="seccion seccion--contexto">
      <h2 className="seccion__titulo">{t("contexto.titulo")}</h2>

      {anterior ? (
        <p className="contexto__resumen">
          {t("contexto.ultimaVisita", {
            fecha: formatearFecha(anterior.fecha, idioma),
            comercial: anterior.comercial,
          })}
          {anterior.incompleta && ` · ${t("estado.incompleta")}`}
        </p>
      ) : (
        <p className="contexto__resumen">{t("contexto.primeraVisita")}</p>
      )}

      {anterior?.notasLibres && (
        <p className="contexto__notas">«{anterior.notasLibres}»</p>
      )}

      {incidenciasAbiertas.length > 0 && (
        <>
          <p className="contexto__subtitulo">
            {t("contexto.abiertas", { count: incidenciasAbiertas.length })}
          </p>
          <ul className="contexto__lista">
            {incidenciasAbiertas.map((i) => (
              <li key={i.id} className="contexto__item">
                <span
                  className={`incidencia__punto incidencia__punto--${i.prioridad}`}
                  aria-hidden="true"
                />
                <span className="contexto__categoria">{i.categoria}</span>
                <span className="contexto__fecha">
                  {formatearFecha(i.fecha, idioma)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function formatearFecha(fecha: string, idioma: Idioma) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio!, mes! - 1, dia!)));
}
