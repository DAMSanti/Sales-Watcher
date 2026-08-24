import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOCALE } from "@sw/shared";
import { ErrorApi, pedir } from "../api/cliente";
import type { IncidenciaBandeja } from "../api/tipos";
import { useSesion } from "../auth/sesion";

type Estado = "abierta" | "en_revision" | "resuelta" | "descartada";

/**
 * Transiciones permitidas, en espejo de las que declara la API.
 *
 * Se duplican aquí para no ofrecer un botón que el servidor va a rechazar. La
 * API sigue siendo la autoridad: esto es cortesía de interfaz, no la defensa.
 */
const SIGUIENTES: Record<Estado, Estado[]> = {
  abierta: ["en_revision", "resuelta", "descartada"],
  en_revision: ["resuelta", "descartada", "abierta"],
  resuelta: [],
  descartada: [],
};

export function Incidencias() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [filas, setFilas] = useState<IncidenciaBandeja[]>([]);
  const [estado, setEstado] = useState<Estado | "">("abierta");
  const [tipo, setTipo] = useState<"incidencia" | "oportunidad" | "">("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams();
      if (estado) parametros.set("estado", estado);
      if (tipo) parametros.set("tipo", tipo);
      setFilas(
        await pedir<IncidenciaBandeja[]>(`/incidencias?${parametros}`, { idioma }),
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
  }, [estado, tipo, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiar(id: string, nuevo: Estado) {
    setEnCurso(id);
    try {
      await pedir(`/incidencias/${id}`, { metodo: "PATCH", cuerpo: { estado: nuevo } });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("incidencias.titulo")}</h1>
          <p className="pagina__subtitulo">{t("incidencias.subtitulo")}</p>
        </div>
      </header>

      <div className="filtros">
        <label className="campo">
          <span className="campo__etiqueta">{t("incidencias.estado")}</span>
          <select
            className="campo__control"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado | "")}
          >
            <option value="">{t("comun.todos")}</option>
            {(["abierta", "en_revision", "resuelta", "descartada"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`estadoInc.${v}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("incidencias.tipo")}</span>
          <select
            className="campo__control"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="">{t("comun.todos")}</option>
            <option value="incidencia">{t("tipoInc.incidencia")}</option>
            <option value="oportunidad">{t("tipoInc.oportunidad")}</option>
          </select>
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
              <th>{t("incidencias.prioridad")}</th>
              <th>{t("incidencias.categoria")}</th>
              <th>{t("incidencias.tienda")}</th>
              <th>{t("incidencias.comercial")}</th>
              <th>{t("incidencias.fecha")}</th>
              <th>{t("incidencias.estado")}</th>
              <th>{t("incidencias.acciones")}</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={7} className="tabla__vacia">
                  {t("comun.cargando")}
                </td>
              </tr>
            )}

            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={7} className="tabla__vacia">
                  {t("comun.vacio")}
                </td>
              </tr>
            )}

            {!cargando &&
              filas.map((f) => (
                <tr key={f.id}>
                  <td>
                    <span className={`punto punto--${f.prioridad}`} aria-hidden="true" />
                    {t(`prioridad.${f.prioridad}`)}
                  </td>
                  <td>
                    <div>{f.categoria.nombre}</div>
                    {f.descripcion && (
                      <div className="tabla__ref">{f.descripcion}</div>
                    )}
                  </td>
                  <td>
                    <div>{f.tienda.nombre}</div>
                    <div className="tabla__ref">{f.tienda.numeroReferencia}</div>
                  </td>
                  <td>
                    <div>{f.comercial.nombre}</div>
                    <div className="tabla__ref">{f.comercial.numeroTrabajador}</div>
                  </td>
                  <td className="tabla__ref">{fechaCorta(f.fecha, idioma)}</td>
                  <td>
                    <span className={`distintivo distintivo--${f.estado}`}>
                      {t(`estadoInc.${f.estado}`)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--e2)", flexWrap: "wrap" }}>
                      {SIGUIENTES[f.estado].map((siguiente) => (
                        <button
                          key={siguiente}
                          className={`boton boton--menudo ${
                            siguiente === "resuelta"
                              ? "boton--principal"
                              : "boton--secundario"
                          }`}
                          onClick={() => void cambiar(f.id, siguiente)}
                          disabled={enCurso === f.id}
                        >
                          {t(`estadoInc.${siguiente}`)}
                        </button>
                      ))}
                    </div>
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
