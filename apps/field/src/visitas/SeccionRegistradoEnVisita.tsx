import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccionDeVisita } from "../api/tipos";
import { pedir } from "../api/cliente";

/**
 * Lo registrado en esta visita, con opción de borrar un misclick.
 *
 * SOLO mientras la visita sigue abierta (`editable`): pasada esa ventana, lo
 * detectado puede haber cruzado ya a la tienda como pendiente de seguimiento,
 * y el servidor rechaza el borrado igual que rechazaría registrar algo nuevo
 * (`visitaEditable`, misma regla en los dos sentidos).
 *
 * Es un borrado real, no "descartar": un misclick no es una decisión de
 * negocio que merezca quedar en el histórico de la tienda.
 */
export function SeccionRegistradoEnVisita({
  acciones,
  visitaId,
  editable,
  alEliminar,
}: {
  acciones: AccionDeVisita[];
  visitaId: string;
  editable: boolean;
  alEliminar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!editable || acciones.length === 0) return null;

  async function eliminar(id: string) {
    setEnCurso(id);
    setError(null);
    try {
      await pedir(`/acciones/${id}`, { metodo: "DELETE" });
      setConfirmando(null);
      await alEliminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <section className="seccion registrado-visita">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">{t("registradoVisita.titulo")}</h2>
        <span className="seccion__contador">{acciones.length}</span>
      </div>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      <ul className="registrado-visita__lista">
        {acciones.map((a) => (
          <li key={a.id} className="registrado-visita__fila">
            <span className="registrado-visita__situacion">
              {t(`situacion.${a.tipoSituacion}`)}
              {a.categoriaProducto !== "transversal" && (
                <span className="tabla__ref"> · {t(`categoria.${a.categoriaProducto}`)}</span>
              )}
            </span>

            {confirmando === a.id ? (
              <span className="registrado-visita__confirmar">
                {t("registradoVisita.confirmar")}
                <button
                  className="boton boton--menudo boton--aviso"
                  onClick={() => void eliminar(a.id)}
                  disabled={enCurso === a.id}
                >
                  {enCurso === a.id ? t("comun.guardando") : t("comun.si")}
                </button>
                <button
                  className="boton boton--menudo boton--secundario"
                  onClick={() => setConfirmando(null)}
                  disabled={enCurso === a.id}
                >
                  {t("comun.no")}
                </button>
              </span>
            ) : (
              <button
                className="boton boton--menudo boton--secundario"
                onClick={() => setConfirmando(a.id)}
                aria-label={t("registradoVisita.eliminar")}
              >
                🗑 {t("registradoVisita.eliminar")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
