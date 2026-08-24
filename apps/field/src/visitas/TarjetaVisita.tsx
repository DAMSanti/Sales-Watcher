import { useTranslation } from "react-i18next";
import { LOCALE, type Idioma } from "@sw/shared";
import type { TarjetaVisita as Datos } from "../api/tipos";

/**
 * Tarjeta de una tienda en la vista del día.
 *
 * Se lee de un vistazo, con el móvil en una mano y muchas veces a contraluz en
 * la calle: por eso el estado va codificado en color además de en texto, y el
 * nombre de la tienda es lo más grande de la tarjeta.
 */
export function TarjetaVisita({ visita, idioma }: { visita: Datos; idioma: Idioma }) {
  const { t } = useTranslation();

  /**
   * Una no realizada SIN justificar es un desenlace distinto y peor que una
   * justificada, y el backoffice las separa. La tarjeta también: si compartieran
   * color, el comercial no vería cuáles le quedan por explicar.
   */
  const sinJustificar = visita.estado === "no_realizada" && !visita.justificada;
  const claseEstado = sinJustificar ? "sin-justificar" : visita.estado;

  return (
    <article className={`tarjeta tarjeta--${claseEstado}`}>
      <div className="tarjeta__cuerpo">
        <div className="tarjeta__superior">
          <h2 className="tarjeta__nombre">{visita.tienda.nombre}</h2>
          <span className={`distintivo distintivo--${claseEstado}`}>
            {sinJustificar
              ? t("estado.sinJustificar")
              : t(`estado.${visita.estado}`)}
          </span>
        </div>

        <p className="tarjeta__referencia">
          {visita.tienda.numeroReferencia}
          {visita.tienda.localidad && ` · ${visita.tienda.localidad}`}
        </p>

        {visita.tienda.direccion && (
          <p className="tarjeta__direccion">{visita.tienda.direccion}</p>
        )}

        <div className="tarjeta__marcas">
          {/*
            Etiqueta discreta, no un color propio: SPECS §5.3 pide que una
            visita extra sea indistinguible de una planificada salvo por esto.
          */}
          {!visita.planificada && (
            <span className="distintivo distintivo--neutro">
              {t("estado.noPlanificada")}
            </span>
          )}

          {visita.incompleta && (
            <span className="distintivo distintivo--incompleta">
              {t("estado.incompleta")}
            </span>
          )}

          {visita.horaInicio && (
            <span className="tarjeta__horario">
              {formatearHora(visita.horaInicio, idioma)}
              {visita.horaFin && ` – ${formatearHora(visita.horaFin, idioma)}`}
            </span>
          )}
        </div>
      </div>

      {visita.ordenSugerido !== null && (
        <div className="tarjeta__orden" aria-hidden="true">
          {visita.ordenSugerido}
        </div>
      )}
    </article>
  );
}

function formatearHora(iso: string, idioma: Idioma) {
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
