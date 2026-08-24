import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOCALE } from "@sw/shared";
import { ErrorApi, pedir } from "../api/cliente";
import type { Dashboard as Datos } from "../api/tipos";
import { useSesion } from "../auth/sesion";

/**
 * Estado del día (SPECS §6.2).
 *
 * Responde a una sola pregunta: ¿cómo va hoy y qué necesita mi atención? Por
 * eso las cifras que exigen acción —sin justificar, incidencias críticas— van
 * en rojo y separadas de las que solo informan.
 */
export function Dashboard() {
  const { t } = useTranslation();
  const { idioma } = useSesion();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /**
     * Se refresca solo cada dos minutos: es una pantalla que el supervisor
     * deja abierta en una pestaña mientras hace otra cosa, y volver a ella
     * para encontrar cifras de hace tres horas sería peor que inútil.
     */
    const cargar = () =>
      pedir<Datos>("/dashboard", { idioma })
        .then((d) => {
          setDatos(d);
          setError(null);
        })
        .catch((e: unknown) =>
          setError(
            e instanceof ErrorApi && e.esFalloDeRed
              ? t("comun.sinConexion")
              : e instanceof Error
                ? e.message
                : String(e),
          ),
        );

    void cargar();
    const temporizador = setInterval(() => void cargar(), 120_000);
    return () => clearInterval(temporizador);
  }, [idioma, t]);

  if (!datos && !error) return <p className="cargando">{t("comun.cargando")}</p>;

  const v = datos?.visitas;
  const c = datos?.comerciales;
  const i = datos?.incidenciasAbiertas;

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("dashboard.titulo")}</h1>
          {datos && (
            <p className="pagina__subtitulo">{fechaLarga(datos.fecha, idioma)}</p>
          )}
        </div>
      </header>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      {datos && (
        <>
          <section className="metricas">
            <Metrica
              valor={v!.total}
              etiqueta={t("dashboard.visitas")}
              pie={`${v!.noPlanificadas} ${t("dashboard.extra").toLowerCase()}`}
            />
            <Metrica valor={v!.finalizadas} etiqueta={t("dashboard.hechas")} tono="ok" />
            <Metrica valor={v!.enCurso} etiqueta={t("dashboard.enCurso")} tono="curso" />
            <Metrica valor={v!.pendientes} etiqueta={t("dashboard.pendientes")} />
            <Metrica
              valor={v!.noRealizadas}
              etiqueta={t("dashboard.noRealizadas")}
              tono={v!.noRealizadas > 0 ? "aviso" : undefined}
            />
            {/*
              Sin justificar en rojo y siempre visible aunque sea cero: es la
              cifra que el supervisor tiene que reclamar, y esconderla cuando
              no hay ninguna haría que su aparición pasara desapercibida.
            */}
            <Metrica
              valor={v!.sinJustificar}
              etiqueta={t("dashboard.sinJustificar")}
              tono={v!.sinJustificar > 0 ? "alerta" : "ok"}
            />
          </section>

          <section className="metricas">
            <Metrica
              valor={c!.conActividad}
              etiqueta={t("dashboard.comerciales")}
              pie={t("dashboard.deTotal", { total: c!.conRuta })}
              tono={c!.conActividad < c!.conRuta ? "aviso" : "ok"}
            />
            <Metrica
              valor={i!.total}
              etiqueta={t("dashboard.abiertas")}
              pie={i!.criticas > 0 ? t("dashboard.criticas", { n: i!.criticas }) : undefined}
              tono={i!.criticas > 0 ? "alerta" : undefined}
            />
            <Metrica
              valor={v!.incompletas}
              etiqueta={t("dashboard.incompletas")}
              tono={v!.incompletas > 0 ? "aviso" : undefined}
            />
          </section>
        </>
      )}
    </>
  );
}

function Metrica({
  valor,
  etiqueta,
  pie,
  tono,
}: {
  valor: number;
  etiqueta: string;
  pie?: string | undefined;
  tono?: "ok" | "curso" | "aviso" | "alerta" | undefined;
}) {
  return (
    <div className={`metrica ${tono ? `metrica--${tono}` : ""}`}>
      <div className="metrica__valor">{valor}</div>
      <div className="metrica__etiqueta">{etiqueta}</div>
      {pie && <div className="metrica__pie">{pie}</div>}
    </div>
  );
}

function fechaLarga(fecha: string, idioma: keyof typeof LOCALE) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(a!, m! - 1, d!)));
}
