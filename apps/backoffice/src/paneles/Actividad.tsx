import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { Metrica } from "../componentes/Metrica";

/**
 * Pantalla Actividad (SPECS §6.2, documento FSM §6).
 *
 * Sustituye al antiguo Dashboard de "completadas vs. planificadas": responde
 * a "¿qué ha ocurrido?", no a "¿se ha cumplido la ruta?". No es el histórico
 * — eso es la ficha de tienda (Consulta de tiendas) — es contexto reciente,
 * agrupado por PDV.
 */

type Comercial = { id: string; numeroTrabajador: string; nombre: string };

type EventoActividad = {
  accionId: string;
  tipoEvento: "oportunidad" | "incidencia" | "extraespacio" | "solucionada";
  categoriaProducto: string;
  tipoSituacion: string;
  fecha: string | null;
  gpvId: string;
  gpv: string;
};

type GrupoTienda = {
  tiendaId: string;
  tienda: string;
  numeroReferencia: string;
  eventos: EventoActividad[];
  resumen: { oportunidades: number; incidencias: number; solucionadas: number };
};

function hace(dias: number) {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}
function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function inicioDeMes() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

const ICONO_EVENTO: Record<EventoActividad["tipoEvento"], string> = {
  oportunidad: "🟢",
  incidencia: "🔴",
  extraespacio: "🧊",
  solucionada: "✅",
};

export function Actividad() {
  const { t } = useTranslation();
  const { idioma } = useSesion();
  const navegar = useNavigate();

  const [desde, setDesde] = useState(hace(7));
  const [hasta, setHasta] = useState(hoy());
  const [usuarioId, setUsuarioId] = useState("");
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [grupos, setGrupos] = useState<GrupoTienda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pedir<{ usuarios: Comercial[] }>("/usuarios?rol=comercial&limite=200", { idioma })
      .then((r) => setComerciales(r.usuarios))
      .catch(() => setComerciales([]));
  }, [idioma]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (usuarioId) p.set("usuarioId", usuarioId);
      setGrupos(await pedir<GrupoTienda[]>(`/actividad?${p}`, { idioma }));
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
  }, [desde, hasta, usuarioId, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function preajuste(dias: number | "mes") {
    setHasta(hoy());
    setDesde(dias === "mes" ? inicioDeMes() : hace(dias));
  }

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("actividad.titulo")}</h1>
          <p className="pagina__subtitulo">{t("actividad.subtitulo")}</p>
        </div>
      </header>

      <div className="filtros">
        <div style={{ display: "flex", gap: "var(--e2)" }}>
          <button className="boton boton--menudo boton--secundario" onClick={() => preajuste(0)}>
            {t("actividad.hoy")}
          </button>
          <button className="boton boton--menudo boton--secundario" onClick={() => preajuste(7)}>
            {t("actividad.semana")}
          </button>
          <button
            className="boton boton--menudo boton--secundario"
            onClick={() => preajuste("mes")}
          >
            {t("actividad.mes")}
          </button>
        </div>
        <label className="campo">
          <span className="campo__etiqueta">{t("comun.desde")}</span>
          <input
            className="campo__control"
            type="date"
            value={desde}
            onChange={(ev) => setDesde(ev.target.value)}
          />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">{t("comun.hasta")}</span>
          <input
            className="campo__control"
            type="date"
            value={hasta}
            onChange={(ev) => setHasta(ev.target.value)}
          />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">{t("actividad.gpv")}</span>
          <select
            className="campo__control"
            value={usuarioId}
            onChange={(ev) => setUsuarioId(ev.target.value)}
          >
            <option value="">{t("comun.todos")}</option>
            {comerciales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}
      {cargando && <p className="cargando">{t("comun.cargando")}</p>}

      {!cargando && grupos.length === 0 && !error && (
        <p className="tabla__vacia">{t("actividad.vacio")}</p>
      )}

      {!cargando &&
        grupos.map((g) => (
          <section key={g.tiendaId} className="tarjeta">
            <div className="tarjeta__cabecera">
              <div>
                <h2 className="tarjeta__titulo">{g.tienda}</h2>
                <p className="tabla__ref">{g.numeroReferencia}</p>
              </div>
              <button
                className="boton boton--menudo boton--secundario"
                onClick={() => navegar(`/consulta-tiendas/${g.tiendaId}`)}
              >
                {t("actividad.verFicha")}
              </button>
            </div>

            <div className="metricas">
              {g.resumen.oportunidades > 0 && (
                <Metrica
                  valor={g.resumen.oportunidades}
                  etiqueta={t("resultados.oportunidades")}
                />
              )}
              {g.resumen.incidencias > 0 && (
                <Metrica valor={g.resumen.incidencias} etiqueta={t("resultados.incidencias")} />
              )}
              {g.resumen.solucionadas > 0 && (
                <Metrica
                  valor={g.resumen.solucionadas}
                  etiqueta={t("resultados.solucionadas")}
                  tono="ok"
                />
              )}
            </div>

            <ul className="registrado-visita__lista">
              {g.eventos.slice(0, 8).map((ev, i) => (
                <li key={`${ev.accionId}-${ev.tipoEvento}-${i}`} className="registrado-visita__fila">
                  <span>
                    <span aria-hidden="true">{ICONO_EVENTO[ev.tipoEvento]}</span>{" "}
                    {t(`situacion.${ev.tipoSituacion}`)}
                    {ev.categoriaProducto !== "transversal" &&
                      ` · ${t(`categoria.${ev.categoriaProducto}`)}`}
                  </span>
                  <span className="tabla__ref">
                    {ev.gpv} ·{" "}
                    {ev.fecha ? new Date(ev.fecha).toLocaleDateString() : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}
