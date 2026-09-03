import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";

/**
 * Buscador de tiendas para el FSM (SPECS §6.4, documento FSM §8.2).
 *
 * Es una pantalla de CONSULTA, distinta de la gestión maestra de "Tiendas"
 * (alta/baja/edición, con dirección y ubicación). Aquí solo se busca para
 * investigar un PDV: nombre y código, nada más — el detalle vive en la ficha.
 *
 * Reutiliza el mismo buscador `/tiendas` que usa la gestión maestra y la app
 * de campo: es el mismo endpoint, con una pantalla distinta encima.
 */

type Fila = {
  tienda: { id: string; nombre: string; numeroReferencia: string };
};

export function ConsultaTiendas() {
  const { t } = useTranslation();
  const { idioma } = useSesion();
  const navegar = useNavigate();

  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limite: "50" });
      if (texto.trim()) p.set("texto", texto.trim());
      const r = await pedir<{ tiendas: Fila[] }>(`/tiendas?${p}`, { idioma });
      setFilas(r.tiendas);
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
  }, [texto, idioma, t]);

  /** Espera antes de consultar: una petición por tecla sería un desperdicio. */
  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(), 250);
    return () => clearTimeout(temporizador);
  }, [cargar]);

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("consultaTiendas.titulo")}</h1>
          <p className="pagina__subtitulo">{t("consultaTiendas.subtitulo")}</p>
        </div>
      </header>

      <div className="filtros">
        <label className="campo" style={{ flex: 1 }}>
          <span className="campo__etiqueta">{t("consultaTiendas.buscar")}</span>
          <input
            className="campo__control"
            type="search"
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            placeholder={t("consultaTiendas.buscarPlaceholder")}
          />
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
              <th>{t("resultados.tienda")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={2} className="tabla__vacia">
                  {t("comun.cargando")}
                </td>
              </tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={2} className="tabla__vacia">
                  {t("comun.vacio")}
                </td>
              </tr>
            )}
            {!cargando &&
              filas.map((f) => (
                <tr key={f.tienda.id}>
                  <td>
                    <div>{f.tienda.nombre}</div>
                    <div className="tabla__ref">{f.tienda.numeroReferencia}</div>
                  </td>
                  <td>
                    <button
                      className="boton boton--menudo boton--secundario"
                      onClick={() => navegar(`/consulta-tiendas/${f.tienda.id}`)}
                    >
                      {t("consultaTiendas.verFicha")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
