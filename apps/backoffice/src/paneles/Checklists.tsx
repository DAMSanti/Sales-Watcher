import { useCallback, useEffect, useState } from "react";
import { IDIOMAS, IDIOMA_DEFECTO, type Idioma, type TextoI18n } from "@sw/shared";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { Dialogo } from "../componentes/Dialogo";

type Plantilla = {
  id: string;
  nombre: TextoI18n;
  tipoTiendaId: string | null;
  activo: boolean;
  esGlobal: boolean;
  numeroItems: number;
  tipoTienda: { id: string; codigo: string } | null;
  faltanIdiomas: Idioma[];
};

type Item = {
  id: string;
  texto: TextoI18n;
  requiereFoto: boolean;
  obligatorio: boolean;
  orden: number;
  activo: boolean;
  faltanIdiomas: Idioma[];
};

export function Checklists() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [abierta, setAbierta] = useState<Plantilla | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoItem, setEditandoItem] = useState<Item | "nuevo" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setPlantillas(await pedir<Plantilla[]>("/checklists", { idioma }));
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
  }, [idioma, t]);

  const cargarItems = useCallback(
    async (plantilla: Plantilla) => {
      setAbierta(plantilla);
      try {
        setItems(await pedir<Item[]>(`/checklists/${plantilla.id}/items`, { idioma }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [idioma],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function desactivarItem(item: Item) {
    try {
      await pedir(`/checklists/items/${item.id}/desactivar`, { metodo: "PATCH" });
      if (abierta) await cargarItems(abierta);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("checklists.titulo")}</h1>
          <p className="pagina__subtitulo">{t("checklists.subtitulo")}</p>
        </div>
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      <div className="tabla-marco" style={{ marginBottom: "var(--e5)" }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("checklists.plantilla")}</th>
              <th>{t("tiendas.tipo")}</th>
              <th className="tabla__num">{t("checklists.items")}</th>
              <th>{t("crud.traducciones")}</th>
              <th />
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
              plantillas.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre.es ?? "—"}</td>
                  <td>
                    {p.esGlobal ? (
                      <span className="distintivo distintivo--neutro">
                        {t("checklists.global")}
                      </span>
                    ) : (
                      p.tipoTienda?.codigo
                    )}
                  </td>
                  <td className="tabla__num">{p.numeroItems}</td>
                  <td>
                    {p.faltanIdiomas.length === 0 ? (
                      <span className="distintivo distintivo--resuelta">5/5</span>
                    ) : (
                      <span className="faltantes">
                        {p.faltanIdiomas.map((i) => (
                          <span key={i} className="faltante">
                            {i}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="boton boton--menudo boton--secundario"
                      onClick={() => void cargarItems(p)}
                    >
                      {t("checklists.verItems")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="metrica__pie">{t("checklists.unaPorTipo")}</p>

      {abierta && (
        <>
          <header className="pagina__cabecera" style={{ marginTop: "var(--e5)" }}>
            <div>
              <h2 className="pagina__titulo" style={{ fontSize: "var(--txt-xl)" }}>
                {abierta.nombre.es}
              </h2>
              <p className="pagina__subtitulo">{t("checklists.items")}</p>
            </div>
            <button
              className="boton boton--principal"
              onClick={() => setEditandoItem("nuevo")}
            >
              {t("checklists.nuevoItem")}
            </button>
          </header>

          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="tabla__num">{t("checklists.orden")}</th>
                  <th>{t("checklists.texto")}</th>
                  <th>{t("checklists.requiereFoto")}</th>
                  <th>{t("checklists.obligatorio")}</th>
                  <th>{t("crud.traducciones")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="tabla__vacia">
                      {t("checklists.sinItems")}
                    </td>
                  </tr>
                )}
                {items.map((i) => (
                  <tr key={i.id} style={i.activo ? undefined : { opacity: 0.55 }}>
                    <td className="tabla__num">{i.orden}</td>
                    <td>{i.texto.es ?? "—"}</td>
                    <td>
                      {i.requiereFoto && (
                        <span className="distintivo distintivo--en_revision">
                          {t("checklists.requiereFoto")}
                        </span>
                      )}
                    </td>
                    <td>
                      {i.obligatorio && (
                        <span className="distintivo distintivo--neutro">
                          {t("checklists.obligatorio")}
                        </span>
                      )}
                    </td>
                    <td>
                      {i.faltanIdiomas.length === 0 ? (
                        <span className="distintivo distintivo--resuelta">5/5</span>
                      ) : (
                        <span className="faltantes">
                          {i.faltanIdiomas.map((l) => (
                            <span key={l} className="faltante">
                              {l}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--e2)" }}>
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => setEditandoItem(i)}
                        >
                          {t("crud.editar")}
                        </button>
                        {i.activo && (
                          <button
                            className="boton boton--menudo boton--secundario"
                            onClick={() => void desactivarItem(i)}
                          >
                            {t("crud.desactivar")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editandoItem && abierta && (
        <FormularioItem
          plantillaId={abierta.id}
          item={editandoItem === "nuevo" ? null : editandoItem}
          siguienteOrden={items.length}
          onCerrar={() => setEditandoItem(null)}
          onGuardado={() => {
            setEditandoItem(null);
            void cargarItems(abierta);
            void cargar();
          }}
        />
      )}
    </>
  );
}

function FormularioItem({
  plantillaId,
  item,
  siguienteOrden,
  onCerrar,
  onGuardado,
}: {
  plantillaId: string;
  item: Item | null;
  siguienteOrden: number;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const [textos, setTextos] = useState<TextoI18n>(item?.texto ?? {});
  const [requiereFoto, setRequiereFoto] = useState(item?.requiereFoto ?? false);
  const [obligatorio, setObligatorio] = useState(item?.obligatorio ?? false);
  const [orden, setOrden] = useState(item?.orden ?? siguienteOrden);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const cuerpo = { texto: textos, requiereFoto, obligatorio, orden };
      if (item) {
        await pedir(`/checklists/items/${item.id}`, { metodo: "PATCH", cuerpo });
      } else {
        await pedir(`/checklists/${plantillaId}/items`, { metodo: "POST", cuerpo });
      }
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo={item ? t("crud.editar") : t("checklists.nuevoItem")}
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
            disabled={enviando || !(textos.es ?? "").trim()}
          >
            {enviando ? t("comun.guardando") : t("comun.guardar")}
          </button>
        </>
      }
    >
      {error && <div className="aviso aviso--error">{error}</div>}

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
              autoFocus={i === IDIOMA_DEFECTO && !item}
            />
          </div>
        ))}
      </div>

      <div className="rejilla">
        <label
          className="campo"
          style={{ flexDirection: "row", alignItems: "center", gap: "var(--e2)" }}
        >
          <input
            type="checkbox"
            checked={requiereFoto}
            onChange={(e) => setRequiereFoto(e.target.checked)}
          />
          <span className="campo__etiqueta">{t("checklists.requiereFoto")}</span>
        </label>

        <label
          className="campo"
          style={{ flexDirection: "row", alignItems: "center", gap: "var(--e2)" }}
        >
          <input
            type="checkbox"
            checked={obligatorio}
            onChange={(e) => setObligatorio(e.target.checked)}
          />
          <span className="campo__etiqueta">{t("checklists.obligatorio")}</span>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("checklists.orden")}</span>
          <input
            className="campo__control"
            type="number"
            min={0}
            value={orden}
            onChange={(e) => setOrden(Number(e.target.value))}
          />
        </label>
      </div>
    </Dialogo>
  );
}
