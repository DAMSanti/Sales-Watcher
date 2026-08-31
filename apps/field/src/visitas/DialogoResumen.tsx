import { useTranslation } from "react-i18next";
import type { ResumenVisita } from "../api/tipos";
import { ICONO_CATEGORIA } from "./flujos";

/**
 * Resumen antes de cerrar la visita (SPECS §5.7).
 *
 * No es decorativo: es la última oportunidad del GPV de ver qué ha generado y
 * corregir un error antes de que la visita quede inmutable.
 *
 * Y NO bloquea. En el MVP no hay mínimos obligatorios para finalizar — es una
 * decisión consciente del cliente mientras define qué exigir. Los avisos
 * informan de lo que falta; el botón de cerrar sigue activo.
 */
export function DialogoResumen({
  resumen,
  cerrando,
  error,
  alConfirmar,
  alCancelar,
}: {
  resumen: ResumenVisita | null;
  cerrando: boolean;
  /**
   * Del intento anterior de finalizar, si falló.
   *
   * Sin esto, un rechazo del servidor (por ejemplo, la visita ya se había
   * finalizado en un reintento anterior que sí llegó) se pintaba en la
   * página de detrás, tapada por este mismo modal — al GPV le parecía que
   * "Finalizar" no hacía nada, cuando en realidad SÍ pasaba algo y no podía
   * verlo.
   */
  error?: string | null;
  alConfirmar: () => void;
  alCancelar: () => void;
}) {
  const { t } = useTranslation();

  const categorias = resumen
    ? (["dairy", "waters", "pbb"] as const).filter((c) => resumen.porCategoria[c])
    : [];

  const nadaRegistrado =
    resumen !== null && categorias.length === 0 && resumen.extraespacios.total === 0;

  return (
    <div className="dialogo__fondo" role="dialog" aria-modal="true" aria-label={t("resumen.titulo")}>
      <div className="dialogo dialogo--resumen">
        <h2 className="dialogo__titulo">{t("resumen.titulo")}</h2>

        {!resumen && <p className="cargando">{t("comun.cargando")}</p>}

        {resumen && (
          <div className="resumen">
            {categorias.map((clave) => {
              const bloque = resumen.porCategoria[clave]!;
              return (
                <section key={clave} className="resumen__categoria">
                  <h3 className="resumen__nombre">
                    <span aria-hidden="true">{ICONO_CATEGORIA[clave]}</span>{" "}
                    {t(`categoria.${clave}`)}
                  </h3>
                  <ul className="resumen__lineas">
                    {bloque.incidencias > 0 && (
                      <li>
                        <span aria-hidden="true">🔴</span>{" "}
                        {t("resumen.incidencias", { n: bloque.incidencias })}
                      </li>
                    )}
                    {bloque.oportunidades > 0 && (
                      <li>
                        <span aria-hidden="true">🟢</span>{" "}
                        {t("resumen.oportunidades", { n: bloque.oportunidades })}
                      </li>
                    )}
                    {bloque.facingsGanados > 0 && (
                      <li>
                        <span aria-hidden="true">📐</span>{" "}
                        {t("resumen.facings", { n: bloque.facingsGanados })}
                      </li>
                    )}
                    {/* Cuánto se ha escalado: el GPV ve que lo que no podía
                        resolver no se ha quedado en el aire. */}
                    {bloque.paraElFsm > 0 && (
                      <li className="resumen__escalado">
                        {t("resumen.paraElFsm", { n: bloque.paraElFsm })}
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}

            {/* Extraespacios va en su propio bloque, fuera de las categorías,
                igual que en el resumen del boceto. */}
            {resumen.extraespacios.total > 0 && (
              <section className="resumen__categoria">
                <h3 className="resumen__nombre">
                  <span aria-hidden="true">🧊</span> {t("bloque.extraespacios")}
                </h3>
                <ul className="resumen__lineas">
                  <li>{t("resumen.extraespacios", { n: resumen.extraespacios.total })}</li>
                </ul>
              </section>
            )}

            <section className="resumen__categoria">
              <h3 className="resumen__nombre">
                <span aria-hidden="true">👤</span> {t("responsable.titulo")}
              </h3>
              <ul className="resumen__lineas">
                <li>
                  {resumen.relacionResponsable?.valoracion
                    ? t(`flujo.valoracion.${resumen.relacionResponsable.valoracion}`)
                    : t("responsable.sinRegistrar")}
                </li>
              </ul>
            </section>

            {nadaRegistrado && (
              <p className="resumen__vacio">{t("resumen.nadaRegistrado")}</p>
            )}

            {/* Avisos, no bloqueos. */}
            {resumen.avisos.length > 0 && (
              <div className="aviso aviso--atencion" role="status">
                <ul className="resumen__avisos">
                  {resumen.avisos.map((a) => (
                    <li key={a.codigo}>{t(`resumen.aviso.${a.codigo}`, { n: a.n })}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="aviso aviso--error" role="alert">
            {error}
          </div>
        )}

        <div className="flujo__acciones">
          <button className="boton boton--secundario" onClick={alCancelar} disabled={cerrando}>
            {t("resumen.seguirEnLaVisita")}
          </button>
          <button
            className="boton boton--principal"
            onClick={alConfirmar}
            disabled={cerrando}
          >
            {cerrando ? t("visita.finalizando") : t("visita.finalizar")}
          </button>
        </div>
      </div>
    </div>
  );
}
