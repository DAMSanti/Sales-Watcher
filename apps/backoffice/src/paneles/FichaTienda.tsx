import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { DetalleFlujo, Evidencia, type Evidencia as TipoEvidencia } from "../componentes/DetalleFlujo";

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
  detalle: Record<string, unknown> | null;
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
  detalle: Record<string, unknown> | null;
  evidencias: TipoEvidencia[];
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
              <div className="acciones-visita">
                {abiertas.map((a) => (
                  <article key={a.id} className="accion-registrada">
                    <div className="accion-registrada__cabecera">
                      <h3 className="accion-registrada__titulo">
                        {t(`situacion.${a.tipoSituacion}`)}
                        {a.categoriaProducto !== "transversal" &&
                          ` · ${t(`categoria.${a.categoriaProducto}`)}`}
                      </h3>
                      <span className={`distintivo ${a.estancada ? "distintivo--sin-justificar" : "distintivo--neutro"}`}>
                        {t("acciones.dias", { n: a.diasAbierta })}
                        {a.estancada && ` · ${t("acciones.estancada")}`}
                      </span>
                    </div>
                    <DetalleFlujo detalle={a.detalle} />
                  </article>
                ))}
              </div>
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
              <div className="acciones-visita">
                {historico.map((h) => (
                  <article key={h.id} className="accion-registrada">
                    <div className="accion-registrada__cabecera">
                      <h3 className="accion-registrada__titulo">
                        {t(`situacion.${h.tipoSituacion}`)}
                        {h.categoriaProducto !== "transversal" &&
                          ` · ${t(`categoria.${h.categoriaProducto}`)}`}
                      </h3>
                      <span className={`distintivo distintivo--${h.estado}`}>
                        {t(`estadoAccion.${h.estado}`)}
                      </span>
                    </div>
                    <DetalleFlujo detalle={h.detalle} />
                    {h.evidencias.length > 0 && (
                      <div className="evidencias">
                        {h.evidencias.map((e) => (
                          <Evidencia key={e.id} evidencia={e} />
                        ))}
                      </div>
                    )}
                    <p className="tarjeta__nota" style={{ margin: "var(--e2) 0 0" }}>
                      {h.resueltaEn ? new Date(h.resueltaEn).toLocaleDateString() : "—"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
