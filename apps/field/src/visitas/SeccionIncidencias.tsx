import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import type { Categoria, IncidenciaVisita } from "../api/tipos";
import { useSesion } from "../auth/sesion";

type Prioridad = "baja" | "media" | "alta" | "critica";
const PRIORIDADES: Prioridad[] = ["baja", "media", "alta", "critica"];

export function SeccionIncidencias({
  incidencias,
  editable,
  visitaId,
  alCambiar,
}: {
  incidencias: IncidenciaVisita[];
  editable: boolean;
  visitaId: string;
  alCambiar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [abierto, setAbierto] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tipo, setTipo] = useState<"incidencia" | "oportunidad">("incidencia");
  const [categoriaId, setCategoriaId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad | "">("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** El catálogo se pide al abrir el formulario, no al cargar la pantalla. */
  useEffect(() => {
    if (!abierto || categorias.length > 0) return;
    void pedir<Categoria[]>("/categorias", { idioma })
      .then(setCategorias)
      .catch(() => setError(t("comun.sinConexion")));
  }, [abierto, categorias.length, idioma, t]);

  const delTipo = categorias.filter((c) => c.tipo === tipo);

  /**
   * Al elegir categoría se adopta su prioridad por defecto, pero el comercial
   * puede cambiarla: es quien está delante del lineal y ve el contexto que la
   * categoría no captura.
   */
  function elegirCategoria(id: string) {
    setCategoriaId(id);
    const categoria = categorias.find((c) => c.id === id);
    if (categoria) setPrioridad(categoria.prioridadDefecto);
  }

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      await pedir(`/visitas/${visitaId}/incidencias`, {
        metodo: "POST",
        cuerpo: {
          categoriaId,
          descripcion: descripcion.trim() || undefined,
          prioridad: prioridad || undefined,
        },
      });
      setAbierto(false);
      setCategoriaId("");
      setDescripcion("");
      setPrioridad("");
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
      setEnviando(false);
    }
  }

  return (
    <section className="seccion">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">{t("visita.incidencias")}</h2>
        {incidencias.length > 0 && (
          <span className="seccion__contador">{incidencias.length}</span>
        )}
      </div>

      {incidencias.length === 0 && !abierto && (
        <p className="seccion__vacio">{t("incidencia.ninguna")}</p>
      )}

      <ul className="incidencias">
        {incidencias.map((i) => (
          <li key={i.id} className="incidencia">
            <div className="incidencia__superior">
              <span
                className={`incidencia__punto incidencia__punto--${i.prioridad}`}
                aria-hidden="true"
              />
              <span className="incidencia__nombre">{i.categoria.nombre}</span>
              <span className="distintivo distintivo--neutro">
                {t(`incidencia.${i.categoria.tipo}`)}
              </span>
            </div>
            {i.descripcion && (
              <p className="incidencia__descripcion">{i.descripcion}</p>
            )}
          </li>
        ))}
      </ul>

      {editable && !abierto && (
        <button
          className="boton boton--secundario boton--ancho"
          onClick={() => setAbierto(true)}
        >
          <span aria-hidden="true">+</span> {t("incidencia.nueva")}
        </button>
      )}

      {abierto && (
        <div className="formulario">
          {error && (
            <div className="aviso aviso--error" role="alert">
              {error}
            </div>
          )}

          <div className="campo">
            <span className="campo__etiqueta">{t("incidencia.tipo")}</span>
            <div className="opciones">
              {(["incidencia", "oportunidad"] as const).map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className={`chip ${tipo === valor ? "chip--activo" : ""}`}
                  onClick={() => {
                    setTipo(valor);
                    setCategoriaId("");
                    setPrioridad("");
                  }}
                  aria-pressed={tipo === valor}
                >
                  {t(`incidencia.${valor}`)}
                </button>
              ))}
            </div>
          </div>

          <label className="campo">
            <span className="campo__etiqueta">{t("incidencia.categoria")}</span>
            <select
              className="campo__control"
              value={categoriaId}
              onChange={(e) => elegirCategoria(e.target.value)}
            >
              <option value="">{t("incidencia.eligeCategoria")}</option>
              {delTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>

          {categoriaId && (
            <div className="campo">
              <span className="campo__etiqueta">{t("incidencia.prioridad")}</span>
              <div className="opciones">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${prioridad === p ? "chip--activo" : ""}`}
                    onClick={() => setPrioridad(p)}
                    aria-pressed={prioridad === p}
                  >
                    {t(`prioridad.${p}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="campo">
            <span className="campo__etiqueta">{t("incidencia.descripcion")}</span>
            <textarea
              className="campo__control"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={t("incidencia.descripcionPlaceholder")}
              maxLength={4000}
            />
          </label>

          <div className="formulario__acciones">
            <button
              className="boton boton--sutil"
              onClick={() => setAbierto(false)}
              disabled={enviando}
            >
              {t("comun.cancelar")}
            </button>
            <button
              className="boton boton--principal"
              onClick={() => void guardar()}
              disabled={enviando || !categoriaId}
            >
              {enviando ? t("comun.guardando") : t("incidencia.guardar")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
