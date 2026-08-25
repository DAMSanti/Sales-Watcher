import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";

/**
 * Histórico de la relación con el responsable de una tienda (SPECS §5.6).
 *
 * Una valoración suelta no dice nada. La serie sí: enseña si la relación
 * mejora, se deteriora, o depende de quién visite — que es exactamente el tipo
 * de cosa que el FSM no puede ver de otro modo.
 *
 * Por eso se pinta como una escalera de puntos y no como una tabla de fechas:
 * la forma de la serie es el dato.
 */

type Punto = {
  visitaId: string;
  fecha: string;
  haHablado: boolean;
  valoracion: string | null;
  cuestionPendiente: boolean;
  comentario: string | null;
  gpv: string;
};

/**
 * Escala de la valoración, de peor a mejor.
 *
 * El orden importa: es lo que convierte una lista de etiquetas en una serie
 * que se puede leer de un vistazo.
 */
const ESCALA = ["mala", "mejorable", "correcta", "buena", "muy_buena"];

export function RelacionResponsable() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    try {
      setPuntos(await pedir<Punto[]>(`/tiendas/${id}/relacion-responsable`, { idioma }));
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setCargando(false);
    }
  }, [id, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const conValoracion = puntos.filter((p) => p.valoracion && ESCALA.includes(p.valoracion));

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <button className="boton boton--menudo boton--secundario" onClick={() => navegar(-1)}>
            ← {t("comun.volver")}
          </button>
          <h1 className="pagina__titulo">{t("relacion.titulo")}</h1>
          <p className="pagina__subtitulo">{t("relacion.subtitulo")}</p>
        </div>
      </header>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}
      {cargando && <p className="cargando">{t("comun.cargando")}</p>}

      {!cargando && puntos.length === 0 && (
        <section className="tarjeta">
          <p className="tabla__vacia">{t("relacion.sinHistorico")}</p>
        </section>
      )}

      {!cargando && conValoracion.length > 0 && (
        <section className="tarjeta">
          <h2 className="tarjeta__titulo">{t("relacion.evolucion")}</h2>
          <p className="tarjeta__nota">{t("relacion.nota")}</p>

          {/*
            Escalera de puntos: la altura es la valoración y el eje horizontal
            el tiempo.

            La escala va en el eje IZQUIERDO, no en una fila bajo el gráfico.
            Como fila era una leyenda inútil —hay una sola serie, no hay nada
            que distinguir por color— y dejaba la altura de cada punto sin
            referencia: se veía subir y bajar sin poder decir desde dónde ni
            hasta dónde. En el eje, cada punto se lee contra su etiqueta.

            El eje queda FUERA del contenedor con scroll: al desplazarse por
            fechas, la escala tiene que seguir a la vista.
          */}
          <div className="serie-marco">
            <div className="serie__eje" aria-hidden="true">
              <div className="serie__eje-pista">
                {ESCALA.map((v, i) => (
                  <span
                    key={v}
                    className="serie__eje-etiqueta"
                    style={{ bottom: `${(i / (ESCALA.length - 1)) * 100}%` }}
                  >
                    {t(`flujo.valoracion.${v}`)}
                  </span>
                ))}
              </div>
              {/* Hueco de la misma altura que la fila de fechas, para que la
                  pista del eje y la de los puntos empiecen a la misma altura. */}
              <span className="serie__fecha">&nbsp;</span>
            </div>

            <div className="serie" role="img" aria-label={t("relacion.evolucion")}>
              {conValoracion.map((p) => {
                const nivel = ESCALA.indexOf(p.valoracion!);
                return (
                  <div
                    key={p.visitaId}
                    className="serie__columna"
                    title={`${p.fecha} · ${t(`flujo.valoracion.${p.valoracion}`)} · ${p.gpv}`}
                  >
                    <div className="serie__pista">
                      <div
                        className="serie__punto"
                        style={{ bottom: `${(nivel / (ESCALA.length - 1)) * 100}%` }}
                      />
                    </div>
                    <span className="serie__fecha">{p.fecha.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {!cargando && puntos.length > 0 && (
        <section className="tarjeta">
          <h2 className="tarjeta__titulo">{t("relacion.visitas")}</h2>
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("detalleVisita.fecha")}</th>
                  <th>{t("detalleVisita.gpv")}</th>
                  <th>{t("responsable.valoracion")}</th>
                  <th>{t("relacion.cuestion")}</th>
                </tr>
              </thead>
              <tbody>
                {[...puntos].reverse().map((p) => (
                  <tr key={p.visitaId}>
                    <td className="tabla__ref">{p.fecha}</td>
                    <td>{p.gpv}</td>
                    <td>
                      {p.haHablado && p.valoracion
                        ? t(`flujo.valoracion.${p.valoracion}`)
                        : t("responsable.noHablado")}
                    </td>
                    <td>
                      {p.cuestionPendiente ? (
                        <span className="distintivo distintivo--en_revision">
                          {p.comentario ?? t("comun.si")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
