import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";

/**
 * Marcas y referencias de producto (SPECS §6.1).
 *
 * Los dos catálogos van juntos porque se usan juntos: una referencia pertenece
 * a una marca, y darlas de alta en pantallas separadas obligaría a ir y venir.
 *
 * NINGUNO LLEVA TRADUCCIÓN. Son nombres propios: «Activia» es Activia en los
 * cinco idiomas. Es el único contenido configurable del sistema sin editor de
 * traducciones, y por eso esta pantalla no lo tiene.
 */

type Marca = {
  id: string;
  nombre: string;
  codigo: string;
  categoriaProducto: string;
  orden: number;
  activo: boolean;
};

type Referencia = {
  referencia: {
    id: string;
    nombre: string;
    codigo: string;
    categoriaProducto: string;
    orden: number;
    activo: boolean;
  };
  marca: { id: string; nombre: string } | null;
};

const CATEGORIAS = ["dairy", "waters", "pbb"] as const;

export function Productos() {
  const { t } = useTranslation();
  const { idioma, perfil } = useSesion();
  const esAdmin = perfil?.rol === "administrador";

  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [categoria, setCategoria] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevaMarca, setNuevaMarca] = useState<{ nombre: string; codigo: string; cat: string } | null>(null);
  const [nuevaRef, setNuevaRef] = useState<{ nombre: string; codigo: string; cat: string; marcaId: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [csv, setCsv] = useState("");
  const [resultadoCsv, setResultadoCsv] = useState<{
    procesadas: number;
    creadas: number;
    actualizadas: number;
    rechazadas: Array<{ linea: number; motivo: string }>;
  } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ incluirInactivas: "true" });
      if (categoria) p.set("categoria", categoria);
      const [m, r] = await Promise.all([
        pedir<Marca[]>("/catalogos/marcas?incluirInactivas=true", { idioma }),
        pedir<Referencia[]>(`/catalogos/referencias?${p}`, { idioma }),
      ]);
      setMarcas(m);
      setReferencias(r);
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setCargando(false);
    }
  }, [categoria, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarMarca() {
    if (!nuevaMarca?.nombre.trim() || !nuevaMarca.codigo.trim()) return;
    try {
      await pedir("/catalogos/marcas", {
        metodo: "POST",
        cuerpo: {
          nombre: nuevaMarca.nombre,
          codigo: nuevaMarca.codigo,
          categoriaProducto: nuevaMarca.cat,
        },
      });
      setNuevaMarca(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function guardarReferencia() {
    if (!nuevaRef?.nombre.trim() || !nuevaRef.codigo.trim()) return;
    try {
      await pedir("/catalogos/referencias", {
        metodo: "POST",
        cuerpo: {
          nombre: nuevaRef.nombre,
          codigo: nuevaRef.codigo,
          categoriaProducto: nuevaRef.cat,
          ...(nuevaRef.marcaId ? { marcaId: nuevaRef.marcaId } : {}),
        },
      });
      setNuevaRef(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Se desactivan, no se borran: el histórico las referencia. */
  async function alternar(tipo: "marcas" | "referencias", id: string, activo: boolean) {
    try {
      await pedir(`/catalogos/${tipo}/${id}`, { metodo: "PATCH", cuerpo: { activo: !activo } });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function importar() {
    try {
      setResultadoCsv(
        await pedir("/catalogos/referencias/importar", {
          metodo: "POST",
          cuerpo: { contenido: csv },
        }),
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("productos.titulo")}</h1>
          <p className="pagina__subtitulo">{t("productos.subtitulo")}</p>
        </div>
      </header>

      {/* Que no se traducen no es un detalle: es lo que explica que esta
          pantalla no tenga editor de idiomas como el resto de catálogos. */}
      <div className="aviso" role="note">
        {t("productos.sinTraduccion")}
      </div>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      {/* ── Marcas ───────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <div className="tarjeta__cabecera">
          <h2 className="tarjeta__titulo">{t("productos.marcas")}</h2>
          {esAdmin && (
            <button
              className="boton boton--menudo boton--principal"
              onClick={() => setNuevaMarca({ nombre: "", codigo: "", cat: "dairy" })}
            >
              {t("crud.nuevo")}
            </button>
          )}
        </div>

        {nuevaMarca && (
          <div className="filtros">
            <label className="campo">
              <span className="campo__etiqueta">{t("productos.nombre")}</span>
              <input
                className="campo__control"
                value={nuevaMarca.nombre}
                onChange={(e) => setNuevaMarca({ ...nuevaMarca, nombre: e.target.value })}
                autoFocus
              />
            </label>
            <label className="campo">
              <span className="campo__etiqueta">{t("productos.codigo")}</span>
              <input
                className="campo__control"
                value={nuevaMarca.codigo}
                onChange={(e) => setNuevaMarca({ ...nuevaMarca, codigo: e.target.value })}
              />
            </label>
            <label className="campo">
              <span className="campo__etiqueta">{t("acciones.categoria")}</span>
              <select
                className="campo__control"
                value={nuevaMarca.cat}
                onChange={(e) => setNuevaMarca({ ...nuevaMarca, cat: e.target.value })}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {t(`categoria.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <button className="boton boton--principal" onClick={() => void guardarMarca()}>
              {t("comun.guardar")}
            </button>
            <button className="boton boton--secundario" onClick={() => setNuevaMarca(null)}>
              {t("comun.cancelar")}
            </button>
          </div>
        )}

        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>{t("productos.nombre")}</th>
                <th>{t("productos.codigo")}</th>
                <th>{t("acciones.categoria")}</th>
                <th>{t("crud.estado")}</th>
                {esAdmin && <th>{t("acciones.acciones")}</th>}
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={5} className="tabla__vacia">
                    {t("comun.cargando")}
                  </td>
                </tr>
              )}
              {!cargando &&
                marcas.map((m) => (
                  <tr key={m.id} className={m.activo ? "" : "fila--inactiva"}>
                    <td>{m.nombre}</td>
                    <td className="tabla__ref">{m.codigo}</td>
                    <td>{t(`categoria.${m.categoriaProducto}`)}</td>
                    <td>
                      <span className={`distintivo distintivo--${m.activo ? "resuelta" : "neutro"}`}>
                        {t(m.activo ? "crud.activo" : "crud.inactivo")}
                      </span>
                    </td>
                    {esAdmin && (
                      <td>
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => void alternar("marcas", m.id, m.activo)}
                        >
                          {t(m.activo ? "crud.desactivar" : "crud.activar")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Referencias ──────────────────────────────────────────────── */}
      <section className="tarjeta">
        <div className="tarjeta__cabecera">
          <h2 className="tarjeta__titulo">{t("productos.referencias")}</h2>
          <div style={{ display: "flex", gap: "var(--e2)", flexWrap: "wrap" }}>
            <select
              className="campo__control"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              style={{ minWidth: "140px" }}
            >
              <option value="">{t("comun.todos")}</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {t(`categoria.${c}`)}
                </option>
              ))}
            </select>
            {esAdmin && (
              <>
                <button
                  className="boton boton--menudo boton--secundario"
                  onClick={() => setImportando(true)}
                >
                  {t("productos.importar")}
                </button>
                <button
                  className="boton boton--menudo boton--principal"
                  onClick={() =>
                    setNuevaRef({ nombre: "", codigo: "", cat: "dairy", marcaId: "" })
                  }
                >
                  {t("crud.nuevo")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* La referencia es lo que el GPV elige al registrar un Top Pico
            ausente; sin catálogo volvería al texto libre y el seguimiento
            entre visitas se rompería. */}
        <p className="tarjeta__nota">{t("productos.notaReferencias")}</p>

        {nuevaRef && (
          <div className="filtros">
            <label className="campo">
              <span className="campo__etiqueta">{t("productos.nombre")}</span>
              <input
                className="campo__control"
                value={nuevaRef.nombre}
                onChange={(e) => setNuevaRef({ ...nuevaRef, nombre: e.target.value })}
                autoFocus
              />
            </label>
            <label className="campo">
              <span className="campo__etiqueta">{t("productos.codigo")}</span>
              <input
                className="campo__control"
                value={nuevaRef.codigo}
                onChange={(e) => setNuevaRef({ ...nuevaRef, codigo: e.target.value })}
              />
            </label>
            <label className="campo">
              <span className="campo__etiqueta">{t("acciones.categoria")}</span>
              <select
                className="campo__control"
                value={nuevaRef.cat}
                onChange={(e) => setNuevaRef({ ...nuevaRef, cat: e.target.value, marcaId: "" })}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {t(`categoria.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span className="campo__etiqueta">{t("productos.marca")}</span>
              <select
                className="campo__control"
                value={nuevaRef.marcaId}
                onChange={(e) => setNuevaRef({ ...nuevaRef, marcaId: e.target.value })}
              >
                <option value="">—</option>
                {marcas
                  .filter((m) => m.activo && m.categoriaProducto === nuevaRef.cat)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <button className="boton boton--principal" onClick={() => void guardarReferencia()}>
              {t("comun.guardar")}
            </button>
            <button className="boton boton--secundario" onClick={() => setNuevaRef(null)}>
              {t("comun.cancelar")}
            </button>
          </div>
        )}

        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>{t("productos.nombre")}</th>
                <th>{t("productos.codigo")}</th>
                <th>{t("productos.marca")}</th>
                <th>{t("acciones.categoria")}</th>
                {esAdmin && <th>{t("acciones.acciones")}</th>}
              </tr>
            </thead>
            <tbody>
              {!cargando && referencias.length === 0 && (
                <tr>
                  <td colSpan={5} className="tabla__vacia">
                    {t("comun.vacio")}
                  </td>
                </tr>
              )}
              {!cargando &&
                referencias.map(({ referencia: r, marca }) => (
                  <tr key={r.id} className={r.activo ? "" : "fila--inactiva"}>
                    <td>{r.nombre}</td>
                    <td className="tabla__ref">{r.codigo}</td>
                    <td>{marca?.nombre ?? "—"}</td>
                    <td>{t(`categoria.${r.categoriaProducto}`)}</td>
                    {esAdmin && (
                      <td>
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => void alternar("referencias", r.id, r.activo)}
                        >
                          {t(r.activo ? "crud.desactivar" : "crud.activar")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {importando && (
        <div className="dialogo__fondo" role="dialog" aria-modal="true">
          <div className="dialogo">
            <h2 className="dialogo__titulo">{t("productos.importar")}</h2>
            <p className="tarjeta__nota">{t("productos.formatoCsv")}</p>
            <textarea
              className="campo__control"
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={"nombre,codigo,categoria,marca\nActivia Natural 4×125 g,act-nat-4x125,dairy,activia"}
            />

            {resultadoCsv && (
              <div className="aviso" role="status">
                {t("productos.resultadoCsv", {
                  creadas: resultadoCsv.creadas,
                  actualizadas: resultadoCsv.actualizadas,
                  rechazadas: resultadoCsv.rechazadas.length,
                })}
                {/* Qué se rechazó y por qué, con la línea: sin eso, corregir
                    un CSV de trescientas filas es adivinar. */}
                {resultadoCsv.rechazadas.length > 0 && (
                  <ul className="resumen__avisos">
                    {resultadoCsv.rechazadas.slice(0, 10).map((r) => (
                      <li key={r.linea}>
                        {t("productos.linea", { n: r.linea })}: {r.motivo}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flujo__acciones">
              <button
                className="boton boton--secundario"
                onClick={() => {
                  setImportando(false);
                  setResultadoCsv(null);
                  setCsv("");
                }}
              >
                {t("comun.cerrar")}
              </button>
              <button className="boton boton--principal" onClick={() => void importar()}>
                {t("productos.importar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
