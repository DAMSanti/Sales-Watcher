import { useCallback, useEffect, useState } from "react";
import { IDIOMAS, IDIOMA_DEFECTO, type Idioma, type TextoI18n } from "@sw/shared";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { Dialogo } from "../componentes/Dialogo";

type Tipo = "categorias" | "motivos" | "tipos-tienda" | "zonas";

type Elemento = {
  id: string;
  codigo: string;
  activo: boolean;
  orden?: number;
  faltanIdiomas: Idioma[];
  nombre?: TextoI18n;
  texto?: TextoI18n;
  tipo?: "incidencia" | "oportunidad";
  prioridadDefecto?: string;
  requiereComentario?: boolean;
  region?: string | null;
  zonaHoraria?: string;
};

/** Cada catálogo guarda su texto en una columna distinta. */
const COLUMNA: Record<Tipo, "nombre" | "texto"> = {
  categorias: "nombre",
  motivos: "texto",
  "tipos-tienda": "nombre",
  zonas: "nombre",
};

export function Catalogos() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [tipo, setTipo] = useState<Tipo>("categorias");
  const [filas, setFilas] = useState<Elemento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Elemento | "nuevo" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFilas(await pedir<Elemento[]>(`/catalogos/${tipo}`, { idioma }));
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
  }, [tipo, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarActivo(elemento: Elemento) {
    try {
      await pedir(`/catalogos/${tipo}/${elemento.id}/activo`, {
        metodo: "PATCH",
        cuerpo: { activo: !elemento.activo },
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const sinTraducir = filas.filter((f) => f.faltanIdiomas.length > 0).length;
  const columna = COLUMNA[tipo];

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("catalogos.titulo")}</h1>
          <p className="pagina__subtitulo">{t("catalogos.subtitulo")}</p>
        </div>
        <button className="boton boton--principal" onClick={() => setEditando("nuevo")}>
          {t("crud.nuevo")}
        </button>
      </header>

      <div className="filtros">
        {(["categorias", "motivos", "tipos-tienda", "zonas"] as const).map((v) => (
          <button
            key={v}
            className={`boton ${tipo === v ? "boton--principal" : "boton--secundario"}`}
            onClick={() => setTipo(v)}
          >
            {t(`catalogos.${v === "tipos-tienda" ? "tiposTienda" : v}`)}
          </button>
        ))}
      </div>

      {/*
        Aviso de traducciones pendientes. Es el mecanismo contra la
        degradación lenta de los idiomas minoritarios: sin él, una categoría
        creada en castellano seis meses después del rollout sale en el idioma
        de respaldo para todos los demás y nadie se entera.
      */}
      {sinTraducir > 0 && (
        <div className="aviso aviso--atencion" role="status">
          <strong>{t("catalogos.pendientesTraducir", { n: sinTraducir })}</strong> —{" "}
          {t("catalogos.avisoTraduccion")}
        </div>
      )}

      {error && <div className="aviso aviso--error">{error}</div>}

      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("crud.codigo")}</th>
              <th>{t("catalogos.nombre")}</th>
              {tipo === "categorias" && <th>{t("catalogos.tipo")}</th>}
              {tipo === "categorias" && <th>{t("catalogos.prioridad")}</th>}
              {tipo === "motivos" && <th>{t("catalogos.requiereComentario")}</th>}
              {tipo === "zonas" && <th>{t("catalogos.zonaHoraria")}</th>}
              <th>{t("crud.traducciones")}</th>
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
            {!cargando &&
              filas.map((f) => (
                <tr key={f.id} style={f.activo ? undefined : { opacity: 0.55 }}>
                  <td className="tabla__ref">{f.codigo}</td>
                  <td>{(f[columna] as TextoI18n | undefined)?.es ?? "—"}</td>
                  {tipo === "categorias" && (
                    <td>
                      <span className="distintivo distintivo--neutro">{f.tipo}</span>
                    </td>
                  )}
                  {tipo === "categorias" && (
                    <td>
                      <span
                        className={`punto punto--${f.prioridadDefecto}`}
                        aria-hidden="true"
                      />
                      {f.prioridadDefecto}
                    </td>
                  )}
                  {tipo === "motivos" && <td>{f.requiereComentario ? "Sí" : "—"}</td>}
                  {tipo === "zonas" && <td className="tabla__ref">{f.zonaHoraria}</td>}
                  <td>
                    {f.faltanIdiomas.length === 0 ? (
                      <span className="distintivo distintivo--resuelta">5/5</span>
                    ) : (
                      <span className="faltantes">
                        {f.faltanIdiomas.map((i) => (
                          <span key={i} className="faltante">
                            {i}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`distintivo distintivo--${f.activo ? "resuelta" : "descartada"}`}
                    >
                      {f.activo ? t("crud.activo") : t("crud.inactivo")}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--e2)" }}>
                      {(tipo === "categorias" ||
                        tipo === "motivos" ||
                        tipo === "zonas") && (
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => setEditando(f)}
                        >
                          {t("crud.editar")}
                        </button>
                      )}
                      <button
                        className="boton boton--menudo boton--secundario"
                        onClick={() => void cambiarActivo(f)}
                      >
                        {f.activo ? t("crud.desactivar") : t("crud.activar")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="metrica__pie" style={{ marginTop: "var(--e3)" }}>
        {t("crud.sinBorrado")}
      </p>

      {editando && (
        <FormularioCatalogo
          tipo={tipo}
          elemento={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </>
  );
}

/**
 * Editor de un elemento de catálogo, con un campo por idioma.
 *
 * El castellano es el único obligatorio: exigir los cinco bloquearía al
 * administrador que necesita dar de alta una categoría hoy porque el cliente
 * la pidió esta mañana. Lo que falte queda visible en la tabla.
 */
function FormularioCatalogo({
  tipo,
  elemento,
  onCerrar,
  onGuardado,
}: {
  tipo: Tipo;
  elemento: Elemento | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const columna = COLUMNA[tipo];

  const [codigo, setCodigo] = useState(elemento?.codigo ?? "");
  const [textos, setTextos] = useState<TextoI18n>(
    (elemento?.[columna] as TextoI18n | undefined) ?? {},
  );
  const [extra, setExtra] = useState({
    tipo: elemento?.tipo ?? "incidencia",
    prioridadDefecto: elemento?.prioridadDefecto ?? "media",
    requiereComentario: elemento?.requiereComentario ?? false,
    region: elemento?.region ?? "",
    zonaHoraria: elemento?.zonaHoraria ?? "Europe/Madrid",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const cuerpo: Record<string, unknown> = { [columna]: textos };
      if (!elemento) cuerpo.codigo = codigo.trim();

      if (tipo === "categorias") {
        cuerpo.tipo = extra.tipo;
        cuerpo.prioridadDefecto = extra.prioridadDefecto;
      }
      if (tipo === "motivos") cuerpo.requiereComentario = extra.requiereComentario;
      if (tipo === "zonas") {
        cuerpo.region = extra.region.trim() || undefined;
        cuerpo.zonaHoraria = extra.zonaHoraria.trim();
      }

      if (elemento) {
        await pedir(`/catalogos/${tipo}/${elemento.id}`, { metodo: "PATCH", cuerpo });
      } else {
        await pedir(`/catalogos/${tipo}`, { metodo: "POST", cuerpo });
      }
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  const valido = (elemento || codigo.trim()) && (textos.es ?? "").trim();

  return (
    <Dialogo
      titulo={elemento ? t("crud.editar") : t("crud.nuevo")}
      onCerrar={onCerrar}
      ancho="560px"
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

      <label className="campo">
        <span className="campo__etiqueta">{t("crud.codigo")}</span>
        <input
          className="campo__control"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          disabled={elemento !== null}
          placeholder="minusculas_y_guion_bajo"
          autoFocus={!elemento}
        />
        {elemento && (
          <span className="campo__etiqueta" style={{ fontWeight: 400 }}>
            {t("crud.codigoFijo")}
          </span>
        )}
      </label>

      <div className="campo">
        <span className="campo__etiqueta">{t("crud.traducciones")}</span>
        {IDIOMAS.map((i) => (
          <div
            key={i}
            className={`traduccion ${i === IDIOMA_DEFECTO ? "traduccion--requerido" : ""}`}
          >
            <span className="traduccion__idioma">{i}</span>
            <input
              className="campo__control traduccion__campo"
              value={textos[i] ?? ""}
              onChange={(e) => setTextos({ ...textos, [i]: e.target.value })}
            />
          </div>
        ))}
        <span className="campo__etiqueta" style={{ fontWeight: 400 }}>
          {t("crud.idiomaObligatorio")}
        </span>
      </div>

      {tipo === "categorias" && (
        <div className="rejilla">
          <label className="campo">
            <span className="campo__etiqueta">{t("catalogos.tipo")}</span>
            <select
              className="campo__control"
              value={extra.tipo}
              onChange={(e) =>
                setExtra({ ...extra, tipo: e.target.value as typeof extra.tipo })
              }
              disabled={elemento !== null}
            >
              <option value="incidencia">{t("tipoInc.incidencia")}</option>
              <option value="oportunidad">{t("tipoInc.oportunidad")}</option>
            </select>
          </label>

          <label className="campo">
            <span className="campo__etiqueta">{t("catalogos.prioridad")}</span>
            <select
              className="campo__control"
              value={extra.prioridadDefecto}
              onChange={(e) => setExtra({ ...extra, prioridadDefecto: e.target.value })}
            >
              {(["baja", "media", "alta", "critica"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`prioridad.${p}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {tipo === "motivos" && (
        <label
          className="campo"
          style={{ flexDirection: "row", alignItems: "center", gap: "var(--e2)" }}
        >
          <input
            type="checkbox"
            checked={extra.requiereComentario}
            onChange={(e) => setExtra({ ...extra, requiereComentario: e.target.checked })}
          />
          <span className="campo__etiqueta">{t("catalogos.requiereComentario")}</span>
        </label>
      )}

      {tipo === "zonas" && (
        <div className="rejilla">
          <label className="campo">
            <span className="campo__etiqueta">{t("catalogos.region")}</span>
            <input
              className="campo__control"
              value={extra.region}
              onChange={(e) => setExtra({ ...extra, region: e.target.value })}
            />
          </label>
          <label className="campo">
            <span className="campo__etiqueta">{t("catalogos.zonaHoraria")}</span>
            <input
              className="campo__control"
              value={extra.zonaHoraria}
              onChange={(e) => setExtra({ ...extra, zonaHoraria: e.target.value })}
              placeholder="Europe/Madrid"
            />
          </label>
        </div>
      )}
    </Dialogo>
  );
}
