import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Accion } from "../api/tipos";
import { ejecutar } from "../offline/cola";

/**
 * Lo que quedó abierto en esta tienda de visitas anteriores (SPECS §5.8).
 *
 * Según el propio boceto, la funcionalidad más importante del sistema: lo
 * detectado no desaparece al cerrar la visita, reaparece hasta que hay
 * resultado.
 *
 * TONO — esto no es una lista de deberes. El cliente ha sido explícito en que
 * la idea es que los GPVs generen MÁS oportunidades, y si volver a una tienda
 * empieza con una lista de reproches, el GPV deja de detectar para no acumular.
 * De ahí que se titule "de tu última visita" y no "pendientes", que el aviso de
 * estancada sea informativo y no una alarma, y que no haya contador rojo.
 */
export function SeccionPendientes({
  acciones,
  visitaId,
  editable,
  alComprobar,
}: {
  acciones: Accion[];
  visitaId: string;
  editable: boolean;
  alComprobar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Plegada por defecto cuando hay muchas.
   *
   * Sin esto, ocho acciones abiertas empujaban las tres categorías fuera de la
   * pantalla: el GPV abría la visita y lo primero que veía era un muro de
   * tareas pendientes. Además de enterrar lo que ha venido a hacer, es
   * exactamente el tono de reproche que el cliente quiere evitar si busca que
   * los GPVs detecten MÁS.
   */
  const MUCHAS = 3;
  const [desplegada, setDesplegada] = useState(acciones.length <= MUCHAS);

  if (acciones.length === 0) return null;

  const visibles = desplegada ? acciones : acciones.slice(0, 1);

  async function responder(accion: Accion, desenlace: "resuelta" | "sigue_pendiente") {
    setEnCurso(accion.id);
    setError(null);

    const datos = {
      desenlace,
      visitaId,
      comprobadaEn: new Date().toISOString(),
      idCliente: crypto.randomUUID(),
    };

    try {
      await ejecutar({
        ruta: `/acciones/${accion.id}/comprobaciones`,
        tipo: "accion.comprobar",
        cuerpo: datos,
        carga: { accionId: accion.id, visita: { id: visitaId }, datos },
      });
      await alComprobar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <section className="seccion pendientes">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">{t("pendientes.titulo")}</h2>
        <span className="seccion__contador">{acciones.length}</span>
      </div>
      <p className="pendientes__intro">{t("pendientes.intro")}</p>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      <ul className="pendientes__lista">
        {visibles.map((a) => (
          <li key={a.id} className="pendiente">
            <div className="pendiente__datos">
              <span className="pendiente__situacion">
                {t(`situacion.${a.tipoSituacion}`)}
                {a.categoriaProducto !== "transversal" && (
                  <span className="pendiente__categoria">
                    {" · "}
                    {t(`categoria.${a.categoriaProducto}`)}
                  </span>
                )}
              </span>

              {/* El Top Pico dice QUÉ referencia falta: sin el nombre, el GPV
                  no puede comprobar nada delante del lineal. */}
              {a.referencia && (
                <span className="pendiente__referencia">{a.referencia.nombre}</span>
              )}

              <span className="pendiente__antiguedad">
                {t("pendientes.desdeHace", { dias: a.diasAbierta })}
                {a.responsableActuar === "fsm" && ` · ${t("pendientes.conTuResponsable")}`}
              </span>
            </div>

            {editable && (
              <div className="pendiente__acciones">
                <button
                  className="boton boton--menudo boton--principal"
                  onClick={() => void responder(a, "resuelta")}
                  disabled={enCurso === a.id}
                >
                  {t("pendientes.resuelto")}
                </button>
                <button
                  className="boton boton--menudo boton--secundario"
                  onClick={() => void responder(a, "sigue_pendiente")}
                  disabled={enCurso === a.id}
                >
                  {t("pendientes.sigueIgual")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {acciones.length > MUCHAS && (
        <button
          className="pendientes__desplegar"
          onClick={() => setDesplegada((v) => !v)}
          aria-expanded={desplegada}
        >
          {desplegada
            ? t("pendientes.plegar")
            : t("pendientes.verTodas", { n: acciones.length - 1 })}
        </button>
      )}
    </section>
  );
}
