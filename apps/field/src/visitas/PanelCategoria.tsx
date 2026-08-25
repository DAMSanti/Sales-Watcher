import { useState } from "react";
import { useTranslation } from "react-i18next";
import { situacionDisponible } from "@sw/shared";
import type { CategoriaProducto, TipoSituacion } from "../api/tipos";
import { FormularioFlujo } from "./FormularioFlujo";
import { BLOQUES, FLUJOS_POR_BLOQUE, ICONO_BLOQUE, ICONO_CATEGORIA } from "./flujos";

/**
 * El interior de una categoría (SPECS §5.4).
 *
 * Al entrar NO aparece un cuestionario: aparece un menú de situaciones posibles,
 * agrupadas en los tres bloques del boceto. El GPV elige la que ha visto y solo
 * entonces responde algo.
 *
 * Es la diferencia entre esta aplicación y la que el cliente pidió no duplicar:
 * aquí, si no hay nada que reportar, no hay nada que responder.
 */
export function PanelCategoria({
  categoria,
  visitaId,
  nombreTienda,
  registradas,
  alVolver,
  alRegistrar,
}: {
  categoria: CategoriaProducto;
  visitaId: string;
  nombreTienda: string;
  /** Cuántas se han registrado ya en esta visita, por tipo. */
  registradas: Record<string, number>;
  alVolver: () => void;
  alRegistrar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [flujo, setFlujo] = useState<TipoSituacion | null>(null);

  if (flujo) {
    return (
      <FormularioFlujo
        tipo={flujo}
        categoria={categoria}
        visitaId={visitaId}
        nombreTienda={nombreTienda}
        alCancelar={() => setFlujo(null)}
        alGuardar={async () => {
          setFlujo(null);
          await alRegistrar();
        }}
      />
    );
  }

  return (
    <div className="categoria">
      <button className="categoria__volver" onClick={alVolver}>
        <span aria-hidden="true">←</span> {t("visita.volverCategorias")}
      </button>

      <h2 className="categoria__titulo">
        <span aria-hidden="true">{ICONO_CATEGORIA[categoria]}</span>{" "}
        {t(`categoria.${categoria}`)}
      </h2>

      {BLOQUES.map((bloque) => {
        /**
         * `situacionDisponible` es la MISMA función que valida el servidor.
         * Es lo que hace que las fechas no aparezcan en Waters — y que si esa
         * regla cambiara, cambiaran a la vez el botón y la validación.
         */
        const flujos = FLUJOS_POR_BLOQUE[bloque].filter((f) =>
          situacionDisponible(f, categoria),
        );
        if (flujos.length === 0) return null;

        return (
          <section key={bloque} className="bloque">
            <h3 className="bloque__titulo">
              <span aria-hidden="true">{ICONO_BLOQUE[bloque]}</span>{" "}
              {t(`bloque.${bloque}`)}
            </h3>
            <div className="bloque__flujos">
              {flujos.map((f) => (
                <button key={f} className="flujo__boton" onClick={() => setFlujo(f)}>
                  <span className="flujo__boton-texto">{t(`situacion.${f}`)}</span>
                  {registradas[f] ? (
                    <span className="flujo__boton-contador">{registradas[f]}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
