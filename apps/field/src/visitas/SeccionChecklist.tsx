import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi } from "../api/cliente";
import { ejecutar } from "../offline/cola";
import { BotonEvidencia } from "../evidencias/BotonEvidencia";
import type { Checklist, ItemChecklist } from "../api/tipos";

/**
 * Checklist de la visita (SPECS §5.4).
 *
 * Un ítem que exige fotografía se muestra deshabilitado con la razón visible,
 * en lugar de dejar pulsar y devolver un error. El servidor lo valida también:
 * esto es comodidad, no la defensa.
 */
export function SeccionChecklist({
  checklist,
  disponible,
  editable,
  visitaId,
  alCambiar,
}: {
  checklist: Checklist | null;
  /** false cuando los datos no se pudieron traer, no cuando no existen. */
  disponible: boolean;
  editable: boolean;
  visitaId: string;
  alCambiar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Marcados sin cobertura, aún no confirmados por el servidor. */
  const [locales, setLocales] = useState<Record<string, boolean>>({});

  /**
   * "No disponible" y "no configurado" son cosas distintas y hay que decirlas
   * distinto: afirmar que la tienda no tiene checklist cuando en realidad no
   * se pudo descargar llevaría al comercial a cerrar la visita sin hacerlo.
   */
  if (!disponible) {
    return (
      <section className="seccion">
        <h2 className="seccion__titulo">{t("visita.checklist")}</h2>
        <div className="aviso aviso--sinconexion">{t("checklist.noDisponible")}</div>
      </section>
    );
  }

  if (!checklist || checklist.items.length === 0) {
    return (
      <section className="seccion">
        <h2 className="seccion__titulo">{t("visita.checklist")}</h2>
        <p className="seccion__vacio">{t("checklist.vacio")}</p>
      </section>
    );
  }

  const estaHecho = (item: ItemChecklist) => locales[item.itemId] ?? item.completado;
  const hechos = checklist.items.filter(estaHecho).length;

  async function alternar(item: ItemChecklist) {
    setEnCurso(item.itemId);
    setError(null);
    try {
      const completado = !item.completado;
      const capturadaEn = new Date().toISOString();

      const resultado = await ejecutar({
        ruta: `/visitas/${visitaId}/checklist/${item.itemId}`,
        tipo: "checklist.marcar",
        cuerpo: { completado, capturadaEn },
        carga: { visita: { id: visitaId }, itemId: item.itemId, completado, capturadaEn },
        descripcion: item.texto,
      });

      if (resultado.via === "directo") {
        await alCambiar();
      } else {
        /**
         * Sin cobertura se marca en local. El servidor volverá a validar el
         * requisito de fotografía al sincronizar: esto es reflejo inmediato
         * para el comercial, no una decisión que sustituya a la del servidor.
         */
        setLocales((previos) => ({ ...previos, [item.itemId]: completado }));
      }
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <section className="seccion">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">{t("visita.checklist")}</h2>
        <span className="seccion__contador">
          {t("checklist.progreso", { hechos, total: checklist.items.length })}
        </span>
      </div>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      <ul className="checklist">
        {checklist.items.map((item) => {
          const completado = estaHecho(item);
          const bloqueado = !item.puedeCompletarse && !completado;
          const deshabilitado = !editable || enCurso !== null || bloqueado;

          return (
            <li key={item.itemId} className="checklist__fila">
              <label
                className={`checklist__item ${completado ? "checklist__item--hecho" : ""}`}
              >
                <input
                  type="checkbox"
                  className="checklist__casilla"
                  checked={completado}
                  disabled={deshabilitado}
                  onChange={() => void alternar(item)}
                />
                <span className="checklist__texto">{item.texto}</span>
              </label>

              <div className="checklist__marcas">
                {item.obligatorio && (
                  <span className="distintivo distintivo--neutro">
                    {t("checklist.obligatorio")}
                  </span>
                )}
                {item.requiereFoto && (
                  <span className="distintivo distintivo--incompleta">
                    {t("checklist.requiereFoto")}
                    {item.fotos > 0 && ` · ${item.fotos}`}
                  </span>
                )}
              </div>

              {/* La razón, no solo el bloqueo: un control apagado sin
                  explicación es lo que genera llamadas al supervisor. */}
              {bloqueado && editable && (
                <p className="checklist__motivo">{t("checklist.faltaFoto")}</p>
              )}

              {/*
                El botón aparece en cuanto el ítem exige foto, no solo cuando
                está bloqueado: el comercial puede querer añadir una segunda
                imagen a algo que ya marcó.
              */}
              {item.requiereFoto && editable && item.resultadoId && (
                <BotonEvidencia
                  destino={{
                    visitaId,
                    ambito: "checklist",
                    resultadoChecklistId: item.resultadoId,
                  }}
                  onSubida={alCambiar}
                  etiqueta={item.fotos > 0 ? t("foto.hacer") : undefined}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
