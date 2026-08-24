import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
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
  editable,
  visitaId,
  alCambiar,
}: {
  checklist: Checklist | null;
  editable: boolean;
  visitaId: string;
  alCambiar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!checklist || checklist.items.length === 0) {
    return (
      <section className="seccion">
        <h2 className="seccion__titulo">{t("visita.checklist")}</h2>
        <p className="seccion__vacio">{t("checklist.vacio")}</p>
      </section>
    );
  }

  const hechos = checklist.items.filter((i) => i.completado).length;

  async function alternar(item: ItemChecklist) {
    setEnCurso(item.itemId);
    setError(null);
    try {
      await pedir(`/visitas/${visitaId}/checklist/${item.itemId}`, {
        metodo: "POST",
        cuerpo: {
          completado: !item.completado,
          capturadaEn: new Date().toISOString(),
        },
      });
      await alCambiar();
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
          const bloqueado = !item.puedeCompletarse && !item.completado;
          const deshabilitado = !editable || enCurso !== null || bloqueado;

          return (
            <li key={item.itemId} className="checklist__fila">
              <label
                className={`checklist__item ${item.completado ? "checklist__item--hecho" : ""}`}
              >
                <input
                  type="checkbox"
                  className="checklist__casilla"
                  checked={item.completado}
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
