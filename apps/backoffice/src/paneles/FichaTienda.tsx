import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";

/**
 * Ficha de tienda (SPECS §6.4, documento FSM §8.3-8.5).
 *
 * Cabecera mínima — nombre, código, GPV responsable — y dos zonas: lo
 * abierto y el histórico. Sin ubicación ni características generales: eso es
 * la gestión maestra (6.1), una pantalla distinta con otra audiencia.
 *
 * El GPV responsable no es una asignación real en el modelo (no existe esa
 * tabla — ver ANEXO/ROADMAP): lo deriva el servidor de quién hizo la última
 * visita a esta tienda.
 */

type Ficha = {
  id: string;
  nombre: string;
  numeroReferencia: string;
  gpvResponsable: { gpvId: string; gpv: string; numeroTrabajador: string } | null;
};

type AccionAbierta = {
  id: string;
  categoriaProducto: string;
  tipoSituacion: string;
  detectadaEn: string;
  diasAbierta: number;
  estancada: boolean;
  comprobaciones: number;
  referencia: { id: string; nombre: string } | null;
};

type AccionHistorico = {
  id: string;
  categoriaProducto: string;
  tipoSituacion: string;
  estado: "resuelta" | "descartada";
  grupo: "oportunidad" | "incidencia" | "extraespacio";
  detectadaEn: string;
  resueltaEn: string | null;
  notaResultado: string | null;
  referencia: { id: string; nombre: string } | null;
};

export function FichaTienda() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { idioma } = useSesion();
  const navegar = useNavigate();

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [abiertas, setAbiertas] = useState<AccionAbierta[]>([]);
  const [historico, setHistorico] = useState<AccionHistorico[]>([]);
  const [tipo, setTipo] = useState("");
  const [resultado, setResultado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (tipo) p.set("tipo", tipo);
      if (resultado) p.set("resultado", resultado);

      const [f, a, h] = await Promise.all([
        pedir<Ficha>(`/tiendas/${id}`, { idioma }),
        pedir<AccionAbierta[]>(`/tiendas/${id}/acciones`, { idioma }),
        pedir<AccionHistorico[]>(`/tiendas/${id}/historico?${p}`, { idioma }),
      ]);
      setFicha(f);
      setAbiertas(a);
      setHistorico(h);
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
  }, [id, tipo, resultado, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando && !ficha) return <p className="cargando">{t("comun.cargando")}</p>;

  return (
    <>
      <button className="categoria__volver" onClick={() => navegar("/consulta-tiendas")}>
        ← {t("comun.volver")}
      </button>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      {ficha && (
        <>
          <header className="pagina__cabecera">
            <div>
              <h1 className="pagina__titulo">{ficha.nombre}</h1>
              <p className="pagina__subtitulo">
                {ficha.numeroReferencia}
                {ficha.gpvResponsable && ` · ${ficha.gpvResponsable.gpv}`}
              </p>
            </div>
          </header>

          {!ficha.gpvResponsable && (
            <p className="tabla__vacia">{t("fichaTienda.sinResponsable")}</p>
          )}

          {/* ── Acciones abiertas ────────────────────────────────────── */}
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{t("fichaTienda.abiertas")}</h2>
            {abiertas.length === 0 ? (
              <p className="tabla__vacia">{t("fichaTienda.sinAbiertas")}</p>
            ) : (
              <ul className="pendientes__lista">
                {abiertas.map((a) => (
                  <li key={a.id} className="pendiente">
                    <div className="pendiente__datos">
                      <span className="pendiente__situacion">
                        {t(`situacion.${a.tipoSituacion}`)}
                        {a.categoriaProducto !== "transversal" && (
                          <span className="pendiente__categoria">
                            {" "}
                            · {t(`categoria.${a.categoriaProducto}`)}
                          </span>
                        )}
                      </span>
                      {a.referencia && (
                        <span className="pendiente__referencia">{a.referencia.nombre}</span>
                      )}
                      <span className="pendiente__antiguedad">
                        {t("acciones.dias", { n: a.diasAbierta })}
                        {a.estancada && ` · ${t("acciones.estancada")}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Histórico ────────────────────────────────────────────── */}
          <section className="tarjeta">
            <div className="tarjeta__cabecera">
              <h2 className="tarjeta__titulo">{t("fichaTienda.historico")}</h2>
            </div>

            <div className="filtros">
              <label className="campo">
                <span className="campo__etiqueta">{t("fichaTienda.filtroTipo")}</span>
                <select
                  className="campo__control"
                  value={tipo}
                  onChange={(ev) => setTipo(ev.target.value)}
                >
                  <option value="">{t("comun.todos")}</option>
                  <option value="oportunidad">{t("resultados.oportunidades")}</option>
                  <option value="incidencia">{t("resultados.incidencias")}</option>
                </select>
              </label>
              <label className="campo">
                <span className="campo__etiqueta">{t("fichaTienda.filtroResultado")}</span>
                <select
                  className="campo__control"
                  value={resultado}
                  onChange={(ev) => setResultado(ev.target.value)}
                >
                  <option value="">{t("comun.todos")}</option>
                  <option value="resuelta">{t("estadoAccion.resuelta")}</option>
                  <option value="descartada">{t("estadoAccion.descartada")}</option>
                </select>
              </label>
            </div>

            {historico.length === 0 ? (
              <p className="tabla__vacia">{t("fichaTienda.sinHistorico")}</p>
            ) : (
              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>{t("acciones.situacion")}</th>
                      <th>{t("acciones.estado")}</th>
                      <th>{t("fichaTienda.fecha")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <div>{t(`situacion.${h.tipoSituacion}`)}</div>
                          <div className="tabla__ref">
                            {h.categoriaProducto !== "transversal" &&
                              t(`categoria.${h.categoriaProducto}`)}
                            {h.referencia && ` · ${h.referencia.nombre}`}
                          </div>
                        </td>
                        <td>
                          <span className={`distintivo distintivo--${h.estado}`}>
                            {t(`estadoAccion.${h.estado}`)}
                          </span>
                        </td>
                        <td className="tabla__ref">
                          {h.resueltaEn ? new Date(h.resueltaEn).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
