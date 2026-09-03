import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { Metrica } from "../componentes/Metrica";
import { BarraApilada, BarrasHorizontales, PASOS_EMBUDO } from "../componentes/Graficos";

/**
 * Dashboard de resultados (SPECS §6.4).
 *
 * Responde a las once preguntas del cliente, que no son de actividad sino de
 * resultado: no «cuántas visitas», sino qué consiguieron.
 *
 * ── Dos decisiones que se ven en la pantalla ──────────────────────────
 *
 * **Detección y resultado por GPV van en la misma tabla, no en dos.**
 * Separarlas crearía un incentivo torcido: premiar solo el resultado
 * desincentiva registrar lo que uno no puede resolver, que es justo lo que
 * debe escalar al FSM.
 *
 * **Cada bloque declara su base temporal.** El embudo es una cohorte por fecha
 * de detección; los Top Picos van por fecha de incorporación. Si se asume que
 * comparten base, los números no cuadran — y quien los lee merece saberlo sin
 * tener que deducirlo.
 */

type Panel = {
  periodo: { desde: string; hasta: string };
  embudo: {
    base: string;
    detectadas: number;
    trabajadas: number;
    solucionadas: number;
    descartadas: number;
    sinTocar: number;
    tasaConversion: number | null;
  };
  logros: {
    facings: number;
    topPicos: { base: string; incorporados: number; pendientes: number };
  };
  patrones: {
    minimoRepeticiones: number;
    stockRepetido: Array<{
      tienda: string;
      numeroReferencia: string;
      categoriaProducto: string;
      veces: number;
      ultima: string;
    }>;
    tiendasRecurrentes: Array<{
      tienda: string;
      numeroReferencia: string;
      localidad: string | null;
      incidencias: number;
      sinResolver: number;
      tipos: string[];
    }>;
  };
  seguimiento: {
    umbralDias: number;
    abiertas: number;
    estancadas: number;
    diasMedios: number;
    masAntiguaDias: number;
  };
  equipo: Array<{
    usuarioId: string;
    nombre: string;
    numeroTrabajador: string;
    detectadas: number;
    oportunidades: number;
    incidencias: number;
    resueltas: number;
    propias: number;
    escaladas: number;
    facings: number;
    tasaResolucionPropia: number | null;
  }>;
  perdidas: {
    lectura: string;
    porTiendaYCategoria: Array<{
      tienda: string;
      numeroReferencia: string;
      categoriaProducto: string;
      detectadas: number;
      sinResultado: number;
    }>;
    facings: { detectadas: number; noConseguidas: number };
  };
};

type Facings = {
  dimension: string;
  total: number;
  filas: Array<{ etiqueta: string | null; facings: number; operaciones: number }>;
};

type FilaDesglose = { etiqueta: string | null; valor: number };

type FilaGestion = { etiqueta: string | null; total: number; solucionadas: number; tasa: number | null };

/** Gestión (documento FSM §10.6): conversión de oportunidades y resolución de incidencias. */
type Gestion = {
  oportunidades: { total: number; solucionadas: number; tasa: number | null; filas: FilaGestion[] };
  incidencias: { total: number; solucionadas: number; tasa: number | null; filas: FilaGestion[] };
};

/** "Resultados conseguidos" (documento FSM §10.3): las cinco métricas, desglosadas Global → GPV → PDV. */
type Conseguidos = {
  skuIncorporadas: { total: number; filas: FilaDesglose[] };
  bloquesMarca: {
    total: number;
    filas: FilaDesglose[];
    porCategoria: { waters: number; pbb: number };
  };
  nuevasImplantaciones: {
    total: number;
    filas: FilaDesglose[];
    quesImplantado: Array<{ nombre: string; veces: number }>;
  };
  huecosSolucionados: { total: number; filas: FilaDesglose[] };
};

type MetricasPeriodo = {
  facingsGanados: number;
  skuIncorporadas: number;
  bloquesMarca: number;
  nuevasImplantaciones: number;
  huecosSolucionados: number;
  oportunidades: { total: number; solucionadas: number; conversion: number | null };
  incidencias: { total: number; solucionadas: number; resolucion: number | null };
};

type Comparacion = {
  periodoA: { desde: string; hasta: string; metricas: MetricasPeriodo };
  periodoB: { desde: string; hasta: string; metricas: MetricasPeriodo };
};

type Comercial = { id: string; numeroTrabajador: string; nombre: string };

/** Análisis — PDV con más (documento FSM §10.7). */
type Ranking = {
  tipo: "oportunidades" | "incidencias";
  filas: Array<{ tienda: string; numeroReferencia: string; valor: number }>;
};

const DIMENSIONES = ["gpv", "tienda", "categoria", "marca", "mes"] as const;

/** Por defecto, los últimos 90 días: un trimestre es el periodo en que el FSM piensa. */
function hace(dias: number) {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}
function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}
function inicioDeMes() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function Resultados() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [desde, setDesde] = useState(hace(90));
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));
  const [gpvFiltro, setGpvFiltro] = useState("");
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [dimension, setDimension] = useState<string>("gpv");

  const [panel, setPanel] = useState<Panel | null>(null);
  const [facings, setFacings] = useState<Facings | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tipoRanking, setTipoRanking] = useState<"oportunidades" | "incidencias">("oportunidades");
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    void pedir<{ usuarios: Comercial[] }>("/usuarios?rol=comercial&limite=200", { idioma })
      .then((r) => setComerciales(r.usuarios))
      .catch(() => setComerciales([]));
  }, [idioma]);

  const [dimensionConseguidos, setDimensionConseguidos] = useState<"gpv" | "tienda">("gpv");
  const [conseguidos, setConseguidos] = useState<Conseguidos | null>(null);

  const [dimensionGestion, setDimensionGestion] = useState<"gpv" | "tienda">("gpv");
  const [gestion, setGestion] = useState<Gestion | null>(null);

  // ── Comparar periodos (documento FSM §10.8) — independiente de los
  // filtros de arriba: aquí los dos periodos se eligen libremente. Por
  // defecto, este mes contra el anterior, que es la comparación más pedida.
  const [desdeA, setDesdeA] = useState(hace(60));
  const [hastaA, setHastaA] = useState(hace(31));
  const [desdeB, setDesdeB] = useState(hace(30));
  const [hastaB, setHastaB] = useState(new Date().toISOString().slice(0, 10));
  const [comparacion, setComparacion] = useState<Comparacion | null>(null);
  const [comparando, setComparando] = useState(false);
  const [errorComparar, setErrorComparar] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Documento FSM §10.2: los filtros generales (GPV + periodo) afectan a
      // todos los bloques de Resultados, ranking incluido.
      const p = `desde=${desde}&hasta=${hasta}${gpvFiltro ? `&usuarioId=${gpvFiltro}` : ""}`;
      const [datos, desglose, logrados, gestionados, rankeados] = await Promise.all([
        pedir<Panel>(`/resultados?${p}`, { idioma }),
        pedir<Facings>(`/resultados/facings?${p}&dimension=${dimension}`, { idioma }),
        pedir<Conseguidos>(`/resultados/conseguidos?${p}&dimension=${dimensionConseguidos}`, {
          idioma,
        }),
        pedir<Gestion>(`/resultados/gestion?${p}&dimension=${dimensionGestion}`, { idioma }),
        pedir<Ranking>(`/resultados/ranking?${p}&tipo=${tipoRanking}`, { idioma }),
      ]);
      setPanel(datos);
      setFacings(desglose);
      setConseguidos(logrados);
      setGestion(gestionados);
      setRanking(rankeados);
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
  }, [
    desde,
    hasta,
    gpvFiltro,
    dimension,
    dimensionConseguidos,
    dimensionGestion,
    tipoRanking,
    idioma,
    t,
  ]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function comparar() {
    setComparando(true);
    setErrorComparar(null);
    try {
      const p = `desdeA=${desdeA}&hastaA=${hastaA}&desdeB=${desdeB}&hastaB=${hastaB}`;
      setComparacion(await pedir<Comparacion>(`/resultados/comparar?${p}`, { idioma }));
    } catch (e) {
      setErrorComparar(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setComparando(false);
    }
  }

  const e = panel?.embudo;
  /** Lo trabajado que aún no ha dado resultado: el escalón intermedio. */
  const enCurso = e ? Math.max(e.trabajadas - e.solucionadas, 0) : 0;

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("resultados.titulo")}</h1>
          <p className="pagina__subtitulo">{t("resultados.subtitulo")}</p>
        </div>
      </header>

      {/*
        Los filtros van en una sola fila por encima de todo lo demás. Cuatro
        opciones exactas de periodo (documento FSM §13): Hoy / Esta semana /
        Este mes / Personalizado — los presets ajustan las fechas libres, que
        siguen editables a mano para el caso "Personalizado".
      */}
      <div className="filtros">
        <div style={{ display: "flex", gap: "var(--e2)" }}>
          <button
            className="boton boton--menudo boton--secundario"
            onClick={() => {
              setHasta(hoyIso());
              setDesde(hoyIso());
            }}
          >
            {t("actividad.hoy")}
          </button>
          <button
            className="boton boton--menudo boton--secundario"
            onClick={() => {
              setHasta(hoyIso());
              setDesde(hace(7));
            }}
          >
            {t("actividad.semana")}
          </button>
          <button
            className="boton boton--menudo boton--secundario"
            onClick={() => {
              setHasta(hoyIso());
              setDesde(inicioDeMes());
            }}
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
            value={gpvFiltro}
            onChange={(ev) => setGpvFiltro(ev.target.value)}
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

      {!cargando && panel && e && (
        <>
          {/* ── Embudo: preguntas 1 a 3 ─────────────────────────────── */}
          <section className="tarjeta">
            <div className="tarjeta__cabecera">
              <h2 className="tarjeta__titulo">{t("resultados.embudo")}</h2>
              <button
                className="boton boton--menudo boton--secundario"
                onClick={() => setVerTabla((v) => !v)}
                aria-expanded={verTabla}
              >
                {verTabla ? t("resultados.verGrafico") : t("resultados.verTabla")}
              </button>
            </div>
            {/* La base temporal, declarada. No es una nota al pie: es lo que
                impide comparar estas cifras con las de Top Picos y concluir
                que no cuadran. */}
            <p className="tarjeta__nota">{t("resultados.baseCohorte")}</p>

            {verTabla ? (
              <table className="tabla">
                <tbody>
                  <tr>
                    <th>{t("resultados.detectadas")}</th>
                    <td>{e.detectadas}</td>
                  </tr>
                  <tr>
                    <th>{t("resultados.solucionadas")}</th>
                    <td>{e.solucionadas}</td>
                  </tr>
                  <tr>
                    <th>{t("resultados.enCurso")}</th>
                    <td>{enCurso}</td>
                  </tr>
                  <tr>
                    <th>{t("resultados.sinTocar")}</th>
                    <td>{e.sinTocar}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <BarraApilada
                titulo={t("resultados.embudo")}
                total={e.detectadas}
                segmentos={[
                  {
                    clave: "solucionadas",
                    valor: e.solucionadas,
                    etiqueta: t("resultados.solucionadas"),
                    color: PASOS_EMBUDO.solucionadas,
                  },
                  {
                    clave: "enCurso",
                    valor: enCurso,
                    etiqueta: t("resultados.enCurso"),
                    color: PASOS_EMBUDO.enCurso,
                  },
                  {
                    clave: "sinTocar",
                    valor: e.sinTocar,
                    etiqueta: t("resultados.sinTocar"),
                    color: PASOS_EMBUDO.sinTocar,
                  },
                ]}
              />
            )}

            <div className="metricas">
              <Metrica valor={e.detectadas} etiqueta={t("resultados.detectadas")} />
              <Metrica
                valor={e.tasaConversion ?? 0}
                sufijo="%"
                etiqueta={t("resultados.conversion")}
                pie={t("resultados.conversionPie")}
                tono={
                  e.tasaConversion === null
                    ? undefined
                    : e.tasaConversion >= 50
                      ? "ok"
                      : "aviso"
                }
              />
            </div>
          </section>

          {/* ── Logros: preguntas 4 y 5 ─────────────────────────────── */}
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{t("resultados.logros")}</h2>
            <div className="metricas">
              <Metrica valor={panel.logros.facings} etiqueta={t("resultados.facings")} />
              <Metrica
                valor={panel.logros.topPicos.incorporados}
                etiqueta={t("resultados.topPicos")}
                pie={t("resultados.baseIncorporacion")}
              />
              <Metrica
                valor={panel.logros.topPicos.pendientes}
                etiqueta={t("resultados.topPicosPendientes")}
              />
            </div>

            <div className="tarjeta__cabecera" style={{ marginTop: "var(--e4)" }}>
              <h3 className="tarjeta__subtitulo">{t("resultados.facingsPor")}</h3>
              <label className="campo campo--enlinea">
                <select
                  className="campo__control"
                  value={dimension}
                  onChange={(ev) => setDimension(ev.target.value)}
                >
                  {DIMENSIONES.map((d) => (
                    <option key={d} value={d}>
                      {t(`resultados.dimension.${d}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <BarrasHorizontales
              vacio={t("resultados.sinFacings")}
              filas={(facings?.filas ?? []).map((f) => ({
                etiqueta: f.etiqueta ?? t("comun.sinDato"),
                valor: f.facings,
                detalle: t("resultados.facingsDetalle", {
                  n: f.facings,
                  ops: f.operaciones,
                }),
              }))}
            />
          </section>

          {/*
            ── Resultados conseguidos: documento FSM §10.3 ──────────────
            Las otras cuatro métricas que el cliente pide con desglose
            Global → GPV → PDV (facings ya tiene la suya arriba, con más
            dimensiones). El total de cada tarjeta ES el "Global"; el
            selector de abajo cambia las cuatro a la vez porque es la misma
            pregunta —¿por GPV o por tienda?— para las cuatro.
          */}
          {conseguidos && (
            <section className="tarjeta">
              <div className="tarjeta__cabecera">
                <h2 className="tarjeta__titulo">{t("resultados.conseguidos")}</h2>
                <label className="campo campo--enlinea">
                  <select
                    className="campo__control"
                    value={dimensionConseguidos}
                    onChange={(ev) => setDimensionConseguidos(ev.target.value as "gpv" | "tienda")}
                  >
                    <option value="gpv">{t("resultados.dimension.gpv")}</option>
                    <option value="tienda">{t("resultados.dimension.tienda")}</option>
                  </select>
                </label>
              </div>

              <div className="metricas">
                <Metrica
                  valor={conseguidos.skuIncorporadas.total}
                  etiqueta={t("resultados.skuIncorporadas")}
                />
                <Metrica
                  valor={conseguidos.bloquesMarca.total}
                  etiqueta={t("resultados.bloquesMarca")}
                  pie={t("resultados.bloquesMarcaDetalle", {
                    waters: conseguidos.bloquesMarca.porCategoria.waters,
                    pbb: conseguidos.bloquesMarca.porCategoria.pbb,
                  })}
                />
                <Metrica
                  valor={conseguidos.nuevasImplantaciones.total}
                  etiqueta={t("resultados.nuevasImplantaciones")}
                  pie={
                    conseguidos.nuevasImplantaciones.quesImplantado.length > 0
                      ? conseguidos.nuevasImplantaciones.quesImplantado
                          .map((m) => m.nombre)
                          .join(", ")
                      : undefined
                  }
                />
                <Metrica
                  valor={conseguidos.huecosSolucionados.total}
                  etiqueta={t("resultados.huecosSolucionados")}
                />
              </div>

              <h3 className="tarjeta__subtitulo">
                {t("resultados.bloquesMarca")} —{" "}
                {t(`resultados.dimension.${dimensionConseguidos}`)}
              </h3>
              <BarrasHorizontales
                vacio={t("comun.vacio")}
                filas={conseguidos.bloquesMarca.filas.map((f) => ({
                  etiqueta: f.etiqueta ?? t("comun.sinDato"),
                  valor: f.valor,
                }))}
              />

              <h3 className="tarjeta__subtitulo" style={{ marginTop: "var(--e4)" }}>
                {t("resultados.nuevasImplantaciones")} —{" "}
                {t(`resultados.dimension.${dimensionConseguidos}`)}
              </h3>
              <BarrasHorizontales
                vacio={t("comun.vacio")}
                filas={conseguidos.nuevasImplantaciones.filas.map((f) => ({
                  etiqueta: f.etiqueta ?? t("comun.sinDato"),
                  valor: f.valor,
                }))}
              />
            </section>
          )}

          {/*
            ── Gestión: documento FSM §10.6 ─────────────────────────────
            Conversión de oportunidades y resolución de incidencias, cada
            una con la numérica absoluta Y el porcentaje al lado — nunca
            solo el porcentaje, porque un % alto con poco volumen no dice lo
            mismo que uno algo menor con mucho volumen.
          */}
          {gestion && (
            <section className="tarjeta">
              <div className="tarjeta__cabecera">
                <h2 className="tarjeta__titulo">{t("resultados.gestion")}</h2>
                <label className="campo campo--enlinea">
                  <select
                    className="campo__control"
                    value={dimensionGestion}
                    onChange={(ev) => setDimensionGestion(ev.target.value as "gpv" | "tienda")}
                  >
                    <option value="gpv">{t("resultados.dimension.gpv")}</option>
                    <option value="tienda">{t("resultados.dimension.tienda")}</option>
                  </select>
                </label>
              </div>

              <div className="metricas">
                <Metrica
                  valor={gestion.oportunidades.solucionadas}
                  etiqueta={t("resultados.conversionOportunidades")}
                  sufijo={
                    gestion.oportunidades.tasa === null ? undefined : ` (${gestion.oportunidades.tasa}%)`
                  }
                  pie={t("resultados.sobreTotal", { n: gestion.oportunidades.total })}
                />
                <Metrica
                  valor={gestion.incidencias.solucionadas}
                  etiqueta={t("resultados.resolucionIncidencias")}
                  sufijo={
                    gestion.incidencias.tasa === null ? undefined : ` (${gestion.incidencias.tasa}%)`
                  }
                  pie={t("resultados.sobreTotal", { n: gestion.incidencias.total })}
                />
              </div>

              {/* El FSM debe poder ver qué PDV (o GPV) componen la numérica. */}
              <h3 className="tarjeta__subtitulo">{t("resultados.conversionOportunidades")}</h3>
              <BarrasHorizontales
                vacio={t("comun.vacio")}
                filas={gestion.oportunidades.filas.map((f) => ({
                  etiqueta: f.etiqueta ?? t("comun.sinDato"),
                  valor: f.solucionadas,
                  detalle: `${f.solucionadas} / ${f.total}${f.tasa === null ? "" : ` (${f.tasa}%)`}`,
                }))}
              />

              <h3 className="tarjeta__subtitulo" style={{ marginTop: "var(--e4)" }}>
                {t("resultados.resolucionIncidencias")}
              </h3>
              <BarrasHorizontales
                vacio={t("comun.vacio")}
                filas={gestion.incidencias.filas.map((f) => ({
                  etiqueta: f.etiqueta ?? t("comun.sinDato"),
                  valor: f.solucionadas,
                  detalle: `${f.solucionadas} / ${f.total}${f.tasa === null ? "" : ` (${f.tasa}%)`}`,
                }))}
              />
            </section>
          )}

          {/*
            ── Análisis — PDV con más: documento FSM §10.7 ──────────────
            Deliberadamente SIN enlace a la tienda: el cliente pide
            explícito que este ranking no sea clicable — para investigar un
            PDV se pasa por Tiendas.
          */}
          {ranking && (
            <section className="tarjeta">
              <div className="tarjeta__cabecera">
                <h2 className="tarjeta__titulo">{t("resultados.analisis")}</h2>
                <label className="campo campo--enlinea">
                  <select
                    className="campo__control"
                    value={tipoRanking}
                    onChange={(ev) =>
                      setTipoRanking(ev.target.value as "oportunidades" | "incidencias")
                    }
                  >
                    <option value="oportunidades">{t("resultados.oportunidades")}</option>
                    <option value="incidencias">{t("resultados.incidencias")}</option>
                  </select>
                </label>
              </div>
              <BarrasHorizontales
                vacio={t("comun.vacio")}
                filas={ranking.filas.map((f) => ({
                  etiqueta: `${f.tienda} (${f.numeroReferencia})`,
                  valor: f.valor,
                }))}
              />
            </section>
          )}

          {/* ── Equipo: preguntas 9 y 10, juntas a propósito ────────── */}
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{t("resultados.equipo")}</h2>
            <p className="tarjeta__nota">{t("resultados.equipoNota")}</p>
            <div className="tabla-marco">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t("resultados.gpv")}</th>
                    <th>{t("resultados.detectadas")}</th>
                    <th>{t("resultados.oportunidades")}</th>
                    <th>{t("resultados.escaladas")}</th>
                    <th>{t("resultados.resueltas")}</th>
                    <th>{t("resultados.tasaPropia")}</th>
                    <th>{t("resultados.facings")}</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.equipo.length === 0 && (
                    <tr>
                      <td colSpan={7} className="tabla__vacia">
                        {t("comun.vacio")}
                      </td>
                    </tr>
                  )}
                  {panel.equipo.map((g) => (
                    <tr key={g.usuarioId}>
                      <td>
                        <div>{g.nombre}</div>
                        <div className="tabla__ref">{g.numeroTrabajador}</div>
                      </td>
                      <td className="tabla__num">{g.detectadas}</td>
                      <td className="tabla__num">{g.oportunidades}</td>
                      <td className="tabla__num">{g.escaladas}</td>
                      <td className="tabla__num">{g.resueltas}</td>
                      <td className="tabla__num">
                        {g.tasaResolucionPropia === null
                          ? "—"
                          : `${g.tasaResolucionPropia}%`}
                      </td>
                      <td className="tabla__num">{g.facings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Seguimiento: pregunta 8 ─────────────────────────────── */}
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{t("resultados.seguimiento")}</h2>
            <p className="tarjeta__nota">{t("resultados.seguimientoNota")}</p>
            <div className="metricas">
              <Metrica
                valor={panel.seguimiento.abiertas}
                etiqueta={t("resultados.abiertas")}
              />
              <Metrica
                valor={panel.seguimiento.estancadas}
                etiqueta={t("resultados.estancadas")}
                pie={t("resultados.umbral", { n: panel.seguimiento.umbralDias })}
                tono={panel.seguimiento.estancadas > 0 ? "alerta" : undefined}
              />
              <Metrica
                valor={panel.seguimiento.diasMedios}
                etiqueta={t("resultados.diasMedios")}
              />
              <Metrica
                valor={panel.seguimiento.masAntiguaDias}
                etiqueta={t("resultados.masAntigua")}
              />
            </div>
          </section>

          {/* ── Patrones: preguntas 6 y 7 ───────────────────────────── */}
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{t("resultados.patrones")}</h2>
            <p className="tarjeta__nota">
              {t("resultados.patronesNota", { n: panel.patrones.minimoRepeticiones })}
            </p>

            <h3 className="tarjeta__subtitulo">{t("resultados.stockRepetido")}</h3>
            <div className="tabla-marco">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t("resultados.tienda")}</th>
                    <th>{t("resultados.categoria")}</th>
                    <th>{t("resultados.veces")}</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.patrones.stockRepetido.length === 0 && (
                    <tr>
                      <td colSpan={3} className="tabla__vacia">
                        {t("resultados.sinPatrones")}
                      </td>
                    </tr>
                  )}
                  {panel.patrones.stockRepetido.slice(0, 10).map((f) => (
                    <tr key={`${f.numeroReferencia}-${f.categoriaProducto}`}>
                      <td>
                        <div>{f.tienda}</div>
                        <div className="tabla__ref">{f.numeroReferencia}</div>
                      </td>
                      <td>{t(`categoria.${f.categoriaProducto}`)}</td>
                      <td className="tabla__num">{f.veces}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="tarjeta__subtitulo">{t("resultados.tiendasRecurrentes")}</h3>
            <div className="tabla-marco">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t("resultados.tienda")}</th>
                    <th>{t("resultados.incidencias")}</th>
                    <th>{t("resultados.sinResolver")}</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.patrones.tiendasRecurrentes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="tabla__vacia">
                        {t("resultados.sinPatrones")}
                      </td>
                    </tr>
                  )}
                  {panel.patrones.tiendasRecurrentes.slice(0, 10).map((f) => (
                    <tr key={f.numeroReferencia}>
                      <td>
                        <div>{f.tienda}</div>
                        <div className="tabla__ref">
                          {f.numeroReferencia}
                          {f.localidad && ` · ${f.localidad}`}
                        </div>
                      </td>
                      <td className="tabla__num">{f.incidencias}</td>
                      <td className="tabla__num">{f.sinResolver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Pérdidas: pregunta 11 ───────────────────────────────── */}
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{t("resultados.perdidas")}</h2>
            {/* La lectura, declarada: es la pregunta más abierta del cliente y
                conviene que se vea cuál se ha elegido. */}
            <p className="tarjeta__nota">{t("resultados.perdidasLectura")}</p>

            <div className="metricas">
              <Metrica
                valor={panel.perdidas.facings.noConseguidas}
                etiqueta={t("resultados.facingsNoConseguidos")}
                pie={t("resultados.deDetectadas", {
                  n: panel.perdidas.facings.detectadas,
                })}
              />
            </div>

            <div className="tabla-marco">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t("resultados.tienda")}</th>
                    <th>{t("resultados.categoria")}</th>
                    <th>{t("resultados.detectadas")}</th>
                    <th>{t("resultados.sinResultado")}</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.perdidas.porTiendaYCategoria.length === 0 && (
                    <tr>
                      <td colSpan={4} className="tabla__vacia">
                        {t("comun.vacio")}
                      </td>
                    </tr>
                  )}
                  {panel.perdidas.porTiendaYCategoria.slice(0, 10).map((f) => (
                    <tr key={`${f.numeroReferencia}-${f.categoriaProducto}`}>
                      <td>
                        <div>{f.tienda}</div>
                        <div className="tabla__ref">{f.numeroReferencia}</div>
                      </td>
                      <td>{t(`categoria.${f.categoriaProducto}`)}</td>
                      <td className="tabla__num">{f.detectadas}</td>
                      <td className="tabla__num">{f.sinResultado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── Comparar periodos (documento FSM §10.8) ──────────────────── */}
      <section className="tarjeta">
        <h2 className="tarjeta__titulo">{t("resultados.comparar")}</h2>
        <p className="tarjeta__nota">{t("resultados.compararNota")}</p>

        <div className="filtros">
          <fieldset className="campo">
            <legend className="campo__etiqueta">{t("resultados.periodoA")}</legend>
            <div style={{ display: "flex", gap: "var(--e2)" }}>
              <input
                className="campo__control"
                type="date"
                value={desdeA}
                onChange={(ev) => setDesdeA(ev.target.value)}
              />
              <input
                className="campo__control"
                type="date"
                value={hastaA}
                onChange={(ev) => setHastaA(ev.target.value)}
              />
            </div>
          </fieldset>
          <fieldset className="campo">
            <legend className="campo__etiqueta">{t("resultados.periodoB")}</legend>
            <div style={{ display: "flex", gap: "var(--e2)" }}>
              <input
                className="campo__control"
                type="date"
                value={desdeB}
                onChange={(ev) => setDesdeB(ev.target.value)}
              />
              <input
                className="campo__control"
                type="date"
                value={hastaB}
                onChange={(ev) => setHastaB(ev.target.value)}
              />
            </div>
          </fieldset>
          <button
            className="boton boton--principal"
            onClick={() => void comparar()}
            disabled={comparando}
          >
            {comparando ? t("comun.cargando") : t("resultados.compararBoton")}
          </button>
        </div>

        {errorComparar && (
          <div className="aviso aviso--error" role="alert">
            {errorComparar}
          </div>
        )}

        {comparacion && (
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("resultados.metrica")}</th>
                  <th>{t("resultados.periodoA")}</th>
                  <th>{t("resultados.periodoB")}</th>
                  <th>{t("resultados.cambio")}</th>
                </tr>
              </thead>
              <tbody>
                <FilaComparacion
                  etiqueta={t("resultados.facings")}
                  a={comparacion.periodoA.metricas.facingsGanados}
                  b={comparacion.periodoB.metricas.facingsGanados}
                />
                <FilaComparacion
                  etiqueta={t("resultados.skuIncorporadas")}
                  a={comparacion.periodoA.metricas.skuIncorporadas}
                  b={comparacion.periodoB.metricas.skuIncorporadas}
                />
                <FilaComparacion
                  etiqueta={t("resultados.bloquesMarca")}
                  a={comparacion.periodoA.metricas.bloquesMarca}
                  b={comparacion.periodoB.metricas.bloquesMarca}
                />
                <FilaComparacion
                  etiqueta={t("resultados.nuevasImplantaciones")}
                  a={comparacion.periodoA.metricas.nuevasImplantaciones}
                  b={comparacion.periodoB.metricas.nuevasImplantaciones}
                />
                <FilaComparacion
                  etiqueta={t("resultados.huecosSolucionados")}
                  a={comparacion.periodoA.metricas.huecosSolucionados}
                  b={comparacion.periodoB.metricas.huecosSolucionados}
                />
                <FilaComparacion
                  etiqueta={t("resultados.oportunidades")}
                  a={comparacion.periodoA.metricas.oportunidades.total}
                  b={comparacion.periodoB.metricas.oportunidades.total}
                />
                <FilaComparacion
                  etiqueta={t("resultados.conversionOportunidades")}
                  a={comparacion.periodoA.metricas.oportunidades.conversion ?? 0}
                  b={comparacion.periodoB.metricas.oportunidades.conversion ?? 0}
                  sufijo="%"
                  esPuntos
                />
                <FilaComparacion
                  etiqueta={t("resultados.incidencias")}
                  a={comparacion.periodoA.metricas.incidencias.total}
                  b={comparacion.periodoB.metricas.incidencias.total}
                />
                <FilaComparacion
                  etiqueta={t("resultados.resolucionIncidencias")}
                  a={comparacion.periodoA.metricas.incidencias.resolucion ?? 0}
                  b={comparacion.periodoB.metricas.incidencias.resolucion ?? 0}
                  sufijo="%"
                  esPuntos
                />
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Una fila de la tabla de comparación.
 *
 * `esPuntos` cambia la unidad del cambio a puntos porcentuales (pp), como pide
 * el documento FSM §10.8 para los porcentajes: restar dos "%" da "pp", no "%".
 */
function FilaComparacion({
  etiqueta,
  a,
  b,
  sufijo = "",
  esPuntos = false,
}: {
  etiqueta: string;
  a: number;
  b: number;
  sufijo?: string;
  esPuntos?: boolean;
}) {
  const delta = b - a;
  const signo = delta > 0 ? "+" : "";
  return (
    <tr>
      <td>{etiqueta}</td>
      <td className="tabla__num">
        {a}
        {sufijo}
      </td>
      <td className="tabla__num">
        {b}
        {sufijo}
      </td>
      <td className="tabla__num">
        {signo}
        {delta}
        {esPuntos ? "pp" : sufijo}
      </td>
    </tr>
  );
}
