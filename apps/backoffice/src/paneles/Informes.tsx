import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, leerToken, pedir } from "../api/cliente";
import type { Cobertura, Ejecucion, NoRealizacion } from "../api/tipos";
import { useSesion } from "../auth/sesion";

/** Por defecto, los últimos 30 días: el periodo que mira un supervisor. */
function hace(dias: number) {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}
function hoy() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Filtros de periodo compartidos por los tres informes.
 *
 * Se aplican con un botón en lugar de al escribir: cambiar la fecha carácter a
 * carácter dispararía una consulta agregada por cada pulsación, y esas
 * consultas recorren la actividad de un mes entero.
 */
function Periodo({
  desde,
  hasta,
  onCambiar,
  extra,
}: {
  desde: string;
  hasta: string;
  onCambiar: (desde: string, hasta: string) => void;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);

  return (
    <div className="filtros">
      <label className="campo">
        <span className="campo__etiqueta">{t("comun.desde")}</span>
        <input
          type="date"
          className="campo__control"
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
      </label>
      <label className="campo">
        <span className="campo__etiqueta">{t("comun.hasta")}</span>
        <input
          type="date"
          className="campo__control"
          value={h}
          onChange={(e) => setH(e.target.value)}
        />
      </label>
      <button className="boton boton--secundario" onClick={() => onCambiar(d, h)}>
        {t("comun.aplicar")}
      </button>
      {extra}
    </div>
  );
}

/**
 * Descarga un CSV protegido.
 *
 * No se puede usar un `<a href>` normal: el endpoint exige la cabecera de
 * autorización y un enlace directo llegaría sin ella. Se pide con fetch y se
 * fuerza la descarga desde el blob resultante.
 */
async function descargarCsv(ruta: string, nombre: string) {
  const respuesta = await fetch(`/api${ruta}`, {
    headers: { Authorization: `Bearer ${leerToken() ?? ""}` },
  });
  if (!respuesta.ok) return;

  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function useInforme<T>(ruta: string, desde: string, hasta: string) {
  const { idioma } = useSesion();
  const { t } = useTranslation();
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await pedir<T>(`${ruta}?desde=${desde}&hasta=${hasta}`, { idioma }));
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  }, [ruta, desde, hasta, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { datos, error };
}

// ── Cobertura ────────────────────────────────────────────────────────

export function InformeCobertura() {
  const { t } = useTranslation();
  const [rango, setRango] = useState({ desde: hace(30), hasta: hoy() });
  const { datos, error } = useInforme<Cobertura>(
    "/informes/cobertura",
    rango.desde,
    rango.hasta,
  );

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("cobertura.titulo")}</h1>
          <p className="pagina__subtitulo">{t("cobertura.subtitulo")}</p>
        </div>
      </header>

      <Periodo
        desde={rango.desde}
        hasta={rango.hasta}
        onCambiar={(desde, hasta) => setRango({ desde, hasta })}
        extra={
          <button
            className="boton boton--secundario"
            onClick={() =>
              void descargarCsv(
                `/informes/cobertura.csv?desde=${rango.desde}&hasta=${rango.hasta}`,
                `cobertura_${rango.desde}_${rango.hasta}.csv`,
              )
            }
          >
            {t("comun.exportar")}
          </button>
        }
      />

      {error && <div className="aviso aviso--error">{error}</div>}

      {datos && (
        <>
          <div className="tarjeta" style={{ marginBottom: "var(--e4)" }}>
            <h2 className="tarjeta__titulo">{t("cobertura.porZona")}</h2>
            <TablaCobertura filas={datos.porZona} claveNombre="zonaCodigo" />
          </div>

          <div className="tarjeta">
            <h2 className="tarjeta__titulo">{t("cobertura.porComercial")}</h2>
            <TablaCobertura filas={datos.porComercial} claveNombre="nombre" />
            <p className="metrica__pie" style={{ marginTop: "var(--e3)" }}>
              {t("cobertura.fueraDeRuta", { n: datos.visitasNoPlanificadas })}
            </p>
          </div>
        </>
      )}
    </>
  );
}

function TablaCobertura({
  filas,
  claveNombre,
}: {
  filas: Array<Record<string, unknown>>;
  claveNombre: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="tabla-marco" style={{ border: "none" }}>
      <table className="tabla">
        <thead>
          <tr>
            <th>{t("cobertura.zona")}</th>
            <th className="tabla__num">{t("cobertura.planificadas")}</th>
            <th className="tabla__num">{t("cobertura.realizadas")}</th>
            <th className="tabla__num">{t("dashboard.sinJustificar")}</th>
            <th style={{ width: "180px" }}>{t("cobertura.tasa")}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, indice) => {
            const cobertura = f.cobertura as number;
            const sinJustificar = f.sinJustificar as number;
            return (
              <tr key={indice}>
                <td>{(f[claveNombre] as string) ?? "—"}</td>
                <td className="tabla__num">{f.planificadas as number}</td>
                <td className="tabla__num">{f.realizadas as number}</td>
                <td
                  className="tabla__num"
                  style={
                    sinJustificar > 0
                      ? { color: "var(--estado-nosinjust-texto)", fontWeight: 700 }
                      : undefined
                  }
                >
                  {sinJustificar}
                </td>
                <td>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "var(--e2)" }}
                  >
                    <div className="barra" style={{ flex: 1 }}>
                      <div
                        /* Por debajo del 80% la barra cambia de color: es el
                           umbral a partir del cual conviene mirar la zona. */
                        className={`barra__relleno ${cobertura < 80 ? "barra__relleno--baja" : ""}`}
                        style={{ width: `${cobertura}%` }}
                      />
                    </div>
                    <span className="tabla__num" style={{ minWidth: "48px" }}>
                      {cobertura}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── No realización ───────────────────────────────────────────────────

export function InformeNoRealizacion() {
  const { t } = useTranslation();
  const [rango, setRango] = useState({ desde: hace(30), hasta: hoy() });
  const { datos, error } = useInforme<NoRealizacion>(
    "/informes/no-realizacion",
    rango.desde,
    rango.hasta,
  );

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("noRealizacion.titulo")}</h1>
          <p className="pagina__subtitulo">{t("noRealizacion.subtitulo")}</p>
        </div>
      </header>

      <Periodo
        desde={rango.desde}
        hasta={rango.hasta}
        onCambiar={(desde, hasta) => setRango({ desde, hasta })}
        extra={
          <button
            className="boton boton--secundario"
            onClick={() =>
              void descargarCsv(
                `/informes/no-realizacion.csv?desde=${rango.desde}&hasta=${rango.hasta}`,
                `no_realizacion_${rango.desde}_${rango.hasta}.csv`,
              )
            }
          >
            {t("comun.exportar")}
          </button>
        }
      />

      {error && <div className="aviso aviso--error">{error}</div>}

      {datos && (
        <>
          {/*
            El aviso de catálogo es la razón principal de este informe: si un
            motivo concentra la mayoría, el desplegable se está usando como
            trámite y el dato deja de medir nada.
          */}
          {datos.concentracion?.revisarCatalogo && (
            <div className="aviso aviso--atencion" role="status">
              {t("noRealizacion.avisoCatalogo", {
                pct: datos.concentracion.porcentaje,
              })}
            </div>
          )}

          <section className="metricas">
            <div className="metrica metrica--aviso">
              <div className="metrica__valor">{datos.resumen.tasaNoRealizacion}%</div>
              <div className="metrica__etiqueta">{t("noRealizacion.tasa")}</div>
              <div className="metrica__pie">
                {datos.resumen.noRealizadas} / {datos.resumen.planificadas}
              </div>
            </div>
            <div className="metrica metrica--ok">
              <div className="metrica__valor">{datos.resumen.justificadas}</div>
              <div className="metrica__etiqueta">{t("justificaciones.titulo")}</div>
            </div>
            <div
              className={`metrica ${datos.resumen.sinJustificar > 0 ? "metrica--alerta" : "metrica--ok"}`}
            >
              <div className="metrica__valor">{datos.resumen.sinJustificar}</div>
              <div className="metrica__etiqueta">{t("dashboard.sinJustificar")}</div>
            </div>
          </section>

          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("noRealizacion.motivo")}</th>
                  <th className="tabla__num">{t("noRealizacion.total")}</th>
                  <th style={{ width: "200px" }}>{t("noRealizacion.porcentaje")}</th>
                  <th className="tabla__num">{t("noRealizacion.aceptadas")}</th>
                  <th className="tabla__num">{t("noRealizacion.pendientes")}</th>
                </tr>
              </thead>
              <tbody>
                {datos.porMotivo.map((m) => (
                  <tr key={m.codigo}>
                    <td>{m.texto}</td>
                    <td className="tabla__num">{m.total}</td>
                    <td>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: "var(--e2)" }}
                      >
                        <div className="barra" style={{ flex: 1 }}>
                          <div
                            className="barra__relleno"
                            style={{ width: `${m.porcentaje}%` }}
                          />
                        </div>
                        <span className="tabla__num" style={{ minWidth: "48px" }}>
                          {m.porcentaje}%
                        </span>
                      </div>
                    </td>
                    <td className="tabla__num">{m.aceptadas}</td>
                    <td className="tabla__num">{m.pendientesRevision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ── Ejecución ────────────────────────────────────────────────────────

export function InformeEjecucion() {
  const { t } = useTranslation();
  const [rango, setRango] = useState({ desde: hace(30), hasta: hoy() });
  const { datos, error } = useInforme<Ejecucion>(
    "/informes/ejecucion",
    rango.desde,
    rango.hasta,
  );

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("ejecucion.titulo")}</h1>
          <p className="pagina__subtitulo">{t("ejecucion.subtitulo")}</p>
        </div>
      </header>

      <Periodo
        desde={rango.desde}
        hasta={rango.hasta}
        onCambiar={(desde, hasta) => setRango({ desde, hasta })}
      />

      {error && <div className="aviso aviso--error">{error}</div>}

      {datos && (
        <section className="metricas">
          <div className="metrica metrica--ok">
            <div className="metrica__valor">{datos.checklist.tasaCumplimiento}%</div>
            <div className="metrica__etiqueta">{t("ejecucion.cumplimiento")}</div>
            <div className="metrica__pie">
              {datos.checklist.completados} / {datos.checklist.itemsEvaluados}
            </div>
          </div>

          <div className="metrica metrica--ok">
            <div className="metrica__valor">{datos.checklist.tasaObligatorios}%</div>
            <div className="metrica__etiqueta">{t("ejecucion.obligatorios")}</div>
            <div className="metrica__pie">
              {datos.checklist.obligatoriosCompletados} /{" "}
              {datos.checklist.obligatoriosEvaluados}
            </div>
          </div>

          <div
            className={`metrica ${datos.visitasIncompletas.tasa > 20 ? "metrica--aviso" : ""}`}
          >
            <div className="metrica__valor">{datos.visitasIncompletas.tasa}%</div>
            <div className="metrica__etiqueta">{t("ejecucion.incompletas")}</div>
            <div className="metrica__pie">
              {datos.visitasIncompletas.incompletas} /{" "}
              {datos.visitasIncompletas.finalizadas}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
