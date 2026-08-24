import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOCALE } from "@sw/shared";
import { ErrorApi, pedir } from "../api/cliente";
import type { JustificacionBandeja } from "../api/tipos";
import { useSesion } from "../auth/sesion";

/**
 * Bandeja de justificaciones (SPECS §6.2).
 *
 * Incluye las visitas no realizadas SIN justificar, que no tienen fila en la
 * tabla de justificaciones y desaparecerían de un listado construido sobre
 * ella. Son las que el supervisor tiene que reclamar, así que van primero y
 * con distintivo rojo.
 */
export function Justificaciones() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [filas, setFilas] = useState<JustificacionBandeja[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFilas(
        await pedir<JustificacionBandeja[]>(
          `/justificaciones?soloPendientes=${soloPendientes}`,
          { idioma },
        ),
      );
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
  }, [soloPendientes, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sinJustificar = filas.filter((f) => !f.justificada).length;

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("justificaciones.titulo")}</h1>
          <p className="pagina__subtitulo">{t("justificaciones.subtitulo")}</p>
        </div>
      </header>

      {sinJustificar > 0 && (
        <div className="aviso aviso--atencion" role="status">
          <strong>
            {sinJustificar} {t("justificaciones.sinJustificar").toLowerCase()}
          </strong>{" "}
          — {t("justificaciones.sinJustificarAyuda")}
        </div>
      )}

      <div className="filtros">
        <label
          className="campo"
          style={{ flexDirection: "row", alignItems: "center", gap: "var(--e2)" }}
        >
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          <span className="campo__etiqueta">
            {t("justificaciones.soloPendientes")}
          </span>
        </label>
      </div>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("incidencias.fecha")}</th>
              <th>{t("incidencias.tienda")}</th>
              <th>{t("incidencias.comercial")}</th>
              <th>{t("justificaciones.motivo")}</th>
              <th>{t("justificaciones.revision")}</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="tabla__vacia">
                  {t("comun.cargando")}
                </td>
              </tr>
            )}

            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={5} className="tabla__vacia">
                  {t("comun.vacio")}
                </td>
              </tr>
            )}

            {!cargando &&
              filas.map((f) => (
                <tr key={f.visitaId}>
                  <td className="tabla__ref">{fechaCorta(f.fecha, idioma)}</td>
                  <td>
                    <div>{f.tienda.nombre}</div>
                    <div className="tabla__ref">{f.tienda.numeroReferencia}</div>
                  </td>
                  <td>
                    <div>{f.comercial.nombre}</div>
                    <div className="tabla__ref">{f.comercial.numeroTrabajador}</div>
                  </td>
                  <td>
                    {f.justificada ? (
                      <>
                        <div>{f.motivo}</div>
                        {f.comentario && (
                          <div className="tabla__ref">«{f.comentario}»</div>
                        )}
                      </>
                    ) : (
                      <span className="distintivo distintivo--sin-justificar">
                        {t("justificaciones.sinJustificar")}
                      </span>
                    )}
                  </td>
                  <td>
                    {f.estadoRevision ? (
                      <span className={`distintivo distintivo--${f.estadoRevision}`}>
                        {f.estadoRevision}
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
    </>
  );
}

function fechaCorta(fecha: string, idioma: keyof typeof LOCALE) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(a!, m! - 1, d!)));
}
