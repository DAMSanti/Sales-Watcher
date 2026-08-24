import { useTranslation } from "react-i18next";
import { useSincronizacion } from "./ContextoSincronizacion";
import "./sincronizacion.css";

/**
 * Indicador de estado de sincronización.
 *
 * Es un requisito explícito de la especificación (SPECS §4), y la razón es
 * concreta: el comercial que trabaja sin cobertura necesita saber que su
 * trabajo no se ha perdido. Sin esta señal, la duda le lleva a repetir la
 * visita entera o a llamar al supervisor.
 *
 * Solo aparece cuando hay algo que decir. Un indicador verde permanente se
 * vuelve invisible por costumbre y deja de comunicar cuando importa.
 */
export function IndicadorSincronizacion() {
  const { t } = useTranslation();
  const { enLinea, pendientes, fallidas, sincronizando, forzarSincronizacion } =
    useSincronizacion();

  const hayPendientes = pendientes.length > 0;
  const hayFallidas = fallidas.length > 0;

  if (enLinea && !hayPendientes && !hayFallidas) return null;

  if (hayFallidas) {
    return (
      <div className="sync sync--error" role="alert">
        <span className="sync__punto" aria-hidden="true" />
        <span className="sync__texto">
          {t("sync.rechazadas", { count: fallidas.length })}
        </span>
      </div>
    );
  }

  if (hayPendientes) {
    return (
      <div className="sync sync--pendiente" role="status">
        <span className="sync__punto" aria-hidden="true" />
        <span className="sync__texto">
          {sincronizando
            ? t("sync.enviando")
            : t("sync.pendientes", { count: pendientes.length })}
        </span>
        {enLinea && !sincronizando && (
          <button className="sync__accion" onClick={() => void forzarSincronizacion()}>
            {t("sync.enviarAhora")}
          </button>
        )}
      </div>
    );
  }

  /** Sin cobertura y sin nada pendiente: se informa igual, porque explica por
   *  qué la pantalla no se está actualizando. */
  return (
    <div className="sync sync--offline" role="status">
      <span className="sync__punto" aria-hidden="true" />
      <span className="sync__texto">{t("comun.sinConexion")}</span>
    </div>
  );
}
