import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RelacionResponsable } from "../api/tipos";
import { ejecutar } from "../offline/cola";
import { OPCIONES } from "./flujos";

/**
 * Relación con el responsable de tienda (SPECS §5.6).
 *
 * Transversal: se registra UNA vez por visita, no una por categoría, porque en
 * cada punto de venta hay un único encargado.
 *
 * El matiz importante está en el enunciado de la valoración: representa la
 * relación GENERAL, no cómo fue la conversación de ese día. No es cosmético —
 * determina cómo se lee el histórico, y una relación "mala" no debería ser el
 * eco de un mal día puntual. Por eso la aclaración va debajo de la pregunta y
 * no escondida en un tooltip.
 */
export function SeccionResponsable({
  relacion,
  visitaId,
  editable,
  alGuardar,
}: {
  relacion: RelacionResponsable | null;
  visitaId: string;
  editable: boolean;
  alGuardar: () => Promise<void>;
}) {
  const { t } = useTranslation();

  const [abierto, setAbierto] = useState(false);
  const [haHablado, setHaHablado] = useState(relacion?.haHablado ?? true);
  const [valoracion, setValoracion] = useState(relacion?.valoracion ?? "");
  const [cuestion, setCuestion] = useState(relacion?.cuestionPendiente ?? false);
  const [comentario, setComentario] = useState(relacion?.comentario ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (haHablado && !valoracion) {
      setError(t("responsable.faltaValoracion"));
      return;
    }
    if (cuestion && !comentario.trim()) {
      setError(t("responsable.faltaComentario"));
      return;
    }

    setEnviando(true);
    setError(null);

    const datos = {
      haHablado,
      valoracion: haHablado ? valoracion : "no_ha_podido_hablar",
      cuestionPendiente: cuestion,
      comentario: comentario.trim() || undefined,
      idCliente: crypto.randomUUID(),
    };

    try {
      await ejecutar({
        ruta: `/visitas/${visitaId}/responsable`,
        metodo: "PUT",
        tipo: "relacion.guardar",
        cuerpo: datos,
        carga: { visita: { id: visitaId }, datos },
      });
      setAbierto(false);
      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="seccion responsable">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">
          <span aria-hidden="true">👤</span> {t("responsable.titulo")}
        </h2>
        {relacion && (
          <span className="distintivo distintivo--resuelta">
            {relacion.valoracion ? t(`flujo.valoracion.${relacion.valoracion}`) : "—"}
          </span>
        )}
      </div>

      {!abierto && (
        <>
          {relacion ? (
            <p className="responsable__resumen">
              {relacion.haHablado ? t("responsable.hablado") : t("responsable.noHablado")}
              {relacion.cuestionPendiente && ` · ${t("responsable.conCuestion")}`}
            </p>
          ) : (
            <p className="responsable__resumen responsable__resumen--vacio">
              {t("responsable.sinRegistrar")}
            </p>
          )}
          {editable && (
            <button
              className="boton boton--secundario boton--ancho"
              onClick={() => setAbierto(true)}
            >
              {relacion ? t("comun.editar") : t("responsable.registrar")}
            </button>
          )}
        </>
      )}

      {abierto && (
        <div className="responsable__formulario">
          <div className="campo">
            <span className="campo__etiqueta">{t("responsable.haHablado")}</span>
            <div className="opciones" role="radiogroup" aria-label={t("responsable.haHablado")}>
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={haHablado === v}
                  className={`opcion ${haHablado === v ? "opcion--activa" : ""}`}
                  onClick={() => setHaHablado(v)}
                >
                  {v ? t("comun.si") : t("comun.no")}
                </button>
              ))}
            </div>
          </div>

          {haHablado && (
            <div className="campo">
              <span className="campo__etiqueta">{t("responsable.valoracion")}</span>
              {/* La aclaración va aquí, visible: es lo que separa "la relación
                  es mala" de "hoy tuvimos un mal rato". */}
              <p className="campo__ayuda">{t("responsable.valoracionAyuda")}</p>
              <div className="opciones opciones--columna">
                {OPCIONES.valoracionRelacion
                  .filter((v) => v !== "no_ha_podido_hablar")
                  .map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`opcion ${valoracion === v ? "opcion--activa" : ""}`}
                      onClick={() => setValoracion(v)}
                    >
                      {t(`flujo.valoracion.${v}`)}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="campo">
            <span className="campo__etiqueta">{t("responsable.cuestion")}</span>
            <div className="opciones" role="radiogroup" aria-label={t("responsable.cuestion")}>
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={cuestion === v}
                  className={`opcion ${cuestion === v ? "opcion--activa" : ""}`}
                  onClick={() => setCuestion(v)}
                >
                  {v ? t("comun.si") : t("comun.no")}
                </button>
              ))}
            </div>
          </div>

          {cuestion && (
            <div className="campo">
              <label className="campo__etiqueta" htmlFor="cuestion-comentario">
                {t("responsable.comentario")}
              </label>
              <textarea
                id="cuestion-comentario"
                className="campo__control"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                maxLength={4000}
              />
            </div>
          )}

          {error && (
            <div className="aviso aviso--error" role="alert">
              {error}
            </div>
          )}

          <div className="flujo__acciones">
            <button
              className="boton boton--secundario"
              onClick={() => setAbierto(false)}
              disabled={enviando}
            >
              {t("comun.cancelar")}
            </button>
            <button
              className="boton boton--principal"
              onClick={() => void guardar()}
              disabled={enviando}
            >
              {enviando ? t("comun.guardando") : t("comun.guardar")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
