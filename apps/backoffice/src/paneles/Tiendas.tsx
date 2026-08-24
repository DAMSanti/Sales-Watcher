import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { Dialogo } from "../componentes/Dialogo";

type Tienda = {
  id: string;
  nombre: string;
  numeroReferencia: string;
  direccion: string | null;
  localidad: string | null;
  codigoPostal: string | null;
  zonaId: string | null;
  tipoTiendaId: string | null;
  origen: "manual" | "csv" | "erp";
  activo: boolean;
  ubicacion: { lat: number; lon: number } | null;
};

type Fila = {
  tienda: Tienda;
  zona: { id: string; codigo: string } | null;
  tipo: { id: string; codigo: string } | null;
};

type Catalogo = { id: string; codigo: string };

type Importacion = {
  procesadas: number;
  creadas: number;
  actualizadas: number;
  rechazadas: Array<{ fila: number; referencia: string; motivo: string }>;
};

export function Tiendas() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [filas, setFilas] = useState<Fila[]>([]);
  const [total, setTotal] = useState(0);
  const [texto, setTexto] = useState("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [zonas, setZonas] = useState<Catalogo[]>([]);
  const [tipos, setTipos] = useState<Catalogo[]>([]);

  const [editando, setEditando] = useState<Tienda | "nueva" | null>(null);
  const [importando, setImportando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ limite: "100" });
      if (texto.trim()) parametros.set("texto", texto.trim());
      if (incluirInactivas) parametros.set("incluirInactivas", "true");

      const respuesta = await pedir<{ total: number; tiendas: Fila[] }>(
        `/tiendas?${parametros}`,
        { idioma },
      );
      setFilas(respuesta.tiendas);
      setTotal(respuesta.total);
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
  }, [texto, incluirInactivas, idioma, t]);

  /** El buscador espera antes de consultar: si no, una petición por tecla. */
  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(temporizador);
  }, [cargar]);

  useEffect(() => {
    void Promise.all([
      pedir<Catalogo[]>("/catalogos/zonas", { idioma }),
      pedir<Catalogo[]>("/catalogos/tipos-tienda", { idioma }),
    ])
      .then(([z, ti]) => {
        setZonas(z);
        setTipos(ti);
      })
      .catch(() => {
        /* Sin catálogos el formulario sigue sirviendo, solo sin desplegables. */
      });
  }, [idioma]);

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("tiendas.titulo")}</h1>
          <p className="pagina__subtitulo">{t("tiendas.subtitulo")}</p>
        </div>
        <div style={{ display: "flex", gap: "var(--e2)" }}>
          <button className="boton boton--secundario" onClick={() => setImportando(true)}>
            {t("tiendas.importar")}
          </button>
          <button className="boton boton--principal" onClick={() => setEditando("nueva")}>
            {t("crud.nuevo")}
          </button>
        </div>
      </header>

      <div className="filtros">
        <label className="campo" style={{ flex: 1, minWidth: "220px" }}>
          <span className="campo__etiqueta">{t("comun.buscar" as never, "Buscar")}</span>
          <input
            className="campo__control"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t("crud.buscar")}
          />
        </label>
        <label
          className="campo"
          style={{ flexDirection: "row", alignItems: "center", gap: "var(--e2)" }}
        >
          <input
            type="checkbox"
            checked={incluirInactivas}
            onChange={(e) => setIncluirInactivas(e.target.checked)}
          />
          <span className="campo__etiqueta">{t("crud.incluirInactivos")}</span>
        </label>
        <span className="metrica__pie">{t("crud.resultados", { n: total })}</span>
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}

      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("tiendas.referencia")}</th>
              <th>{t("tiendas.nombre")}</th>
              <th>{t("tiendas.localidad")}</th>
              <th>{t("tiendas.zona")}</th>
              <th>{t("tiendas.tipo")}</th>
              <th>{t("tiendas.origen")}</th>
              <th>{t("crud.activo")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={8} className="tabla__vacia">
                  {t("comun.cargando")}
                </td>
              </tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={8} className="tabla__vacia">
                  {t("comun.vacio")}
                </td>
              </tr>
            )}
            {!cargando &&
              filas.map(({ tienda, zona, tipo }) => (
                <tr key={tienda.id} style={tienda.activo ? undefined : { opacity: 0.55 }}>
                  <td className="tabla__ref">{tienda.numeroReferencia}</td>
                  <td>{tienda.nombre}</td>
                  <td>{tienda.localidad ?? "—"}</td>
                  <td>{zona?.codigo ?? "—"}</td>
                  <td>{tipo?.codigo ?? "—"}</td>
                  <td>
                    <span className="distintivo distintivo--neutro">{tienda.origen}</span>
                  </td>
                  <td>
                    <span
                      className={`distintivo distintivo--${tienda.activo ? "resuelta" : "descartada"}`}
                    >
                      {tienda.activo ? t("crud.activo") : t("crud.inactivo")}
                    </span>
                  </td>
                  <td>
                    <button
                      className="boton boton--menudo boton--secundario"
                      onClick={() => setEditando(tienda)}
                    >
                      {t("crud.editar")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <FormularioTienda
          tienda={editando === "nueva" ? null : editando}
          zonas={zonas}
          tipos={tipos}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}

      {importando && (
        <DialogoImportar
          onCerrar={() => setImportando(false)}
          onImportado={() => void cargar()}
        />
      )}
    </>
  );
}

function FormularioTienda({
  tienda,
  zonas,
  tipos,
  onCerrar,
  onGuardado,
}: {
  tienda: Tienda | null;
  zonas: Catalogo[];
  tipos: Catalogo[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const [datos, setDatos] = useState({
    nombre: tienda?.nombre ?? "",
    numeroReferencia: tienda?.numeroReferencia ?? "",
    direccion: tienda?.direccion ?? "",
    localidad: tienda?.localidad ?? "",
    codigoPostal: tienda?.codigoPostal ?? "",
    zonaId: tienda?.zonaId ?? "",
    tipoTiendaId: tienda?.tipoTiendaId ?? "",
    lat: tienda?.ubicacion?.lat?.toString() ?? "",
    lon: tienda?.ubicacion?.lon?.toString() ?? "",
    activo: tienda?.activo ?? true,
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const cuerpo: Record<string, unknown> = {
        nombre: datos.nombre.trim(),
        numeroReferencia: datos.numeroReferencia.trim(),
        direccion: datos.direccion.trim() || undefined,
        localidad: datos.localidad.trim() || undefined,
        codigoPostal: datos.codigoPostal.trim() || undefined,
        zonaId: datos.zonaId || undefined,
        tipoTiendaId: datos.tipoTiendaId || undefined,
        activo: datos.activo,
      };

      const lat = Number(datos.lat);
      const lon = Number(datos.lon);
      if (datos.lat && datos.lon && Number.isFinite(lat) && Number.isFinite(lon)) {
        cuerpo.ubicacion = {
          lat,
          lon,
          precisionM: 0,
          capturadoEn: new Date().toISOString(),
        };
      }

      if (tienda) {
        await pedir(`/tiendas/${tienda.id}`, { metodo: "PATCH", cuerpo });
      } else {
        await pedir("/tiendas", { metodo: "POST", cuerpo });
      }
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  const valido = datos.nombre.trim() && datos.numeroReferencia.trim();

  return (
    <Dialogo
      titulo={tienda ? t("crud.editar") : t("crud.nuevo")}
      onCerrar={onCerrar}
      ancho="620px"
      acciones={
        <>
          <button className="boton boton--sutil" onClick={onCerrar} disabled={enviando}>
            {t("comun.cancelar")}
          </button>
          <button
            className="boton boton--principal"
            onClick={() => void guardar()}
            disabled={enviando || !valido}
          >
            {enviando ? t("comun.guardando") : t("comun.guardar")}
          </button>
        </>
      }
    >
      {error && <div className="aviso aviso--error">{error}</div>}

      <div className="rejilla">
        <label className="campo rejilla--completa">
          <span className="campo__etiqueta">{t("tiendas.nombre")}</span>
          <input
            className="campo__control"
            value={datos.nombre}
            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
            autoFocus
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.referencia")}</span>
          <input
            className="campo__control"
            value={datos.numeroReferencia}
            onChange={(e) => setDatos({ ...datos, numeroReferencia: e.target.value })}
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.cp")}</span>
          <input
            className="campo__control"
            value={datos.codigoPostal}
            onChange={(e) => setDatos({ ...datos, codigoPostal: e.target.value })}
          />
        </label>

        <label className="campo rejilla--completa">
          <span className="campo__etiqueta">{t("tiendas.direccion")}</span>
          <input
            className="campo__control"
            value={datos.direccion}
            onChange={(e) => setDatos({ ...datos, direccion: e.target.value })}
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.localidad")}</span>
          <input
            className="campo__control"
            value={datos.localidad}
            onChange={(e) => setDatos({ ...datos, localidad: e.target.value })}
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.zona")}</span>
          <select
            className="campo__control"
            value={datos.zonaId}
            onChange={(e) => setDatos({ ...datos, zonaId: e.target.value })}
          >
            <option value="">—</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.codigo}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.tipo")}</span>
          <select
            className="campo__control"
            value={datos.tipoTiendaId}
            onChange={(e) => setDatos({ ...datos, tipoTiendaId: e.target.value })}
          >
            <option value="">—</option>
            {tipos.map((ti) => (
              <option key={ti.id} value={ti.id}>
                {ti.codigo}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("crud.activo")}</span>
          <select
            className="campo__control"
            value={datos.activo ? "1" : "0"}
            onChange={(e) => setDatos({ ...datos, activo: e.target.value === "1" })}
          >
            <option value="1">{t("crud.activo")}</option>
            <option value="0">{t("crud.inactivo")}</option>
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.lat")}</span>
          <input
            className="campo__control"
            value={datos.lat}
            onChange={(e) => setDatos({ ...datos, lat: e.target.value })}
            inputMode="decimal"
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("tiendas.lon")}</span>
          <input
            className="campo__control"
            value={datos.lon}
            onChange={(e) => setDatos({ ...datos, lon: e.target.value })}
            inputMode="decimal"
          />
        </label>

        <p className="campo__etiqueta rejilla--completa" style={{ fontWeight: 400 }}>
          {t("tiendas.ubicacionAyuda")}
        </p>
      </div>
    </Dialogo>
  );
}

/**
 * Importación CSV.
 *
 * Muestra las filas rechazadas con su número de línea y su motivo: un fichero
 * de tres mil tiendas con dos filas malas carga las demás, y el administrador
 * necesita saber exactamente cuáles corregir sin revisarlo entero.
 */
function DialogoImportar({
  onCerrar,
  onImportado,
}: {
  onCerrar: () => void;
  onImportado: () => void;
}) {
  const { t } = useTranslation();
  const [contenido, setContenido] = useState("");
  const [resultado, setResultado] = useState<Importacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importar() {
    setEnviando(true);
    setError(null);
    try {
      setResultado(
        await pedir<Importacion>("/tiendas/importar", {
          metodo: "POST",
          cuerpo: { contenido },
        }),
      );
      onImportado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo={t("tiendas.importar")}
      onCerrar={onCerrar}
      ancho="720px"
      acciones={
        <>
          <button className="boton boton--sutil" onClick={onCerrar}>
            {resultado ? t("comun.cancelar") : t("comun.cancelar")}
          </button>
          {!resultado && (
            <button
              className="boton boton--principal"
              onClick={() => void importar()}
              disabled={enviando || contenido.trim().length < 10}
            >
              {enviando ? t("comun.guardando") : t("tiendas.importar")}
            </button>
          )}
        </>
      }
    >
      {error && <div className="aviso aviso--error">{error}</div>}

      {!resultado ? (
        <>
          <p className="campo__etiqueta" style={{ fontWeight: 400 }}>
            {t("tiendas.importarAyuda")}
          </p>
          <textarea
            className="campo__control"
            style={{ minHeight: "220px", fontFamily: "ui-monospace, monospace" }}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            spellCheck={false}
          />
        </>
      ) : (
        <>
          <div
            className={`aviso ${resultado.rechazadas.length > 0 ? "aviso--atencion" : ""}`}
            style={
              resultado.rechazadas.length === 0
                ? { background: "var(--estado-fin-fondo)", color: "var(--estado-fin-texto)" }
                : undefined
            }
          >
            {t("tiendas.importarResultado", {
              creadas: resultado.creadas,
              actualizadas: resultado.actualizadas,
              rechazadas: resultado.rechazadas.length,
            })}
          </div>

          {resultado.rechazadas.length > 0 && (
            <div className="tabla-marco">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t("tiendas.fila")}</th>
                    <th>{t("tiendas.referencia")}</th>
                    <th>{t("tiendas.motivo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.rechazadas.map((r, i) => (
                    <tr key={i}>
                      <td className="tabla__num">{r.fila}</td>
                      <td className="tabla__ref">{r.referencia || "—"}</td>
                      <td>{r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Dialogo>
  );
}
