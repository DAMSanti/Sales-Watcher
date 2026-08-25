import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../auth/sesion";
import { Metrica } from "../componentes/Metrica";

/**
 * Panel de acciones pendientes del FSM (SPECS §6.2).
 *
 * Es la pantalla principal del FSM, y responde a una pregunta distinta de la
 * que responden los informes: no «cuánta actividad ha habido», sino **qué está
 * abierto y desde cuándo**.
 *
 * Por eso lo primero que se ve es la antigüedad, y por eso el orden por defecto
 * es de más antiguo a más reciente: una de las preguntas que el cliente quiere
 * responder es literalmente «¿qué acciones llevan demasiado tiempo abiertas?».
 */

type Accion = {
  id: string;
  visitaOrigenId: string;
  categoriaProducto: string;
  tipoSituacion: string;
  responsableActuar: "gpv" | "fsm";
  estado: "abierta" | "en_curso" | "resuelta" | "descartada";
  prioridad: string;
  detectadaEn: string;
  diasAbierta: number;
  estancada: boolean;
  comprobaciones: number;
  codigoNevera: string | null;
  cerradaPorRol: string | null;
  tienda: {
    id: string;
    nombre: string;
    numeroReferencia: string;
    localidad: string | null;
    canal: string | null;
  };
  detectadaPor: { nombre: string; numeroTrabajador: string };
};

type Comprobacion = {
  id: string;
  desenlace: string;
  comentario: string | null;
  comprobadaEn: string;
  autor: { nombre: string; numeroTrabajador: string; rol: string };
};

const CATEGORIAS = ["dairy", "waters", "pbb"] as const;

export function Acciones() {
  const { t } = useTranslation();
  const { idioma } = useSesion();
  const navegar = useNavigate();

  const [filas, setFilas] = useState<Accion[]>([]);
  const [estado, setEstado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [responsable, setResponsable] = useState("");
  const [soloEstancadas, setSoloEstancadas] = useState(false);
  const [cerradasPorGpv, setCerradasPorGpv] = useState(false);
  /** Cuántas acciones del FSM ha cerrado un GPV esta semana. */
  const [avisoCierres, setAvisoCierres] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  /** Historial desplegado de una acción. `null` = ninguna abierta. */
  const [detalle, setDetalle] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Comprobacion[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limite: "200" });
      if (estado) p.set("estado", estado);
      if (categoria) p.set("categoriaProducto", categoria);
      if (responsable) p.set("responsableActuar", responsable);
      if (soloEstancadas) p.set("soloEstancadas", "true");
      if (cerradasPorGpv) p.set("cerradasPorGpv", "true");
      setFilas(await pedir<Accion[]>(`/acciones?${p}`, { idioma }));
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
  }, [estado, categoria, responsable, soloEstancadas, cerradasPorGpv, idioma, t]);

  /**
   * El aviso se pide aparte de la bandeja.
   *
   * Esas acciones están CERRADAS, así que no aparecen en la lista por defecto
   * y el FSM no se enteraría de que alguien cerró algo que le tocaba a él.
   */
  useEffect(() => {
    void pedir<{ total: number }>("/acciones/cerradas-por-gpv", { idioma })
      .then((r) => setAvisoCierres(r.total))
      .catch(() => setAvisoCierres(0));
  }, [idioma, filas]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cerrar(id: string, nuevo: "resuelta" | "descartada") {
    setEnCurso(id);
    try {
      await pedir(`/acciones/${id}`, { metodo: "PATCH", cuerpo: { estado: nuevo } });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCurso(null);
    }
  }

  async function verHistorial(id: string) {
    if (detalle === id) {
      setDetalle(null);
      return;
    }
    setDetalle(id);
    setHistorial([]);
    try {
      setHistorial(await pedir<Comprobacion[]>(`/acciones/${id}/comprobaciones`, { idioma }));
    } catch {
      setHistorial([]);
    }
  }

  const estancadas = filas.filter((f) => f.estancada).length;

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("acciones.titulo")}</h1>
          <p className="pagina__subtitulo">{t("acciones.subtitulo")}</p>
        </div>
      </header>

      {/* Dos cifras arriba, no diez: cuántas hay abiertas y cuántas llevan
          demasiado tiempo. Todo lo demás se filtra. */}
      <div className="metricas">
        <Metrica valor={filas.length} etiqueta={t("acciones.abiertas")} />
        <Metrica
          valor={estancadas}
          etiqueta={t("acciones.estancadas")}
          pie={t("acciones.estancadasPie")}
          tono={estancadas > 0 ? "alerta" : undefined}
        />
      </div>

      <div className="filtros">
        <label className="campo">
          <span className="campo__etiqueta">{t("acciones.estado")}</span>
          <select
            className="campo__control"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          >
            <option value="">{t("acciones.abiertasYEnCurso")}</option>
            {(["abierta", "en_curso", "resuelta", "descartada"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`estadoAccion.${v}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("acciones.categoria")}</span>
          <select
            className="campo__control"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">{t("comun.todos")}</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {t(`categoria.${c}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("acciones.responsable")}</span>
          <select
            className="campo__control"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
          >
            <option value="">{t("comun.todos")}</option>
            <option value="fsm">{t("acciones.paraMi")}</option>
            <option value="gpv">{t("acciones.paraElGpv")}</option>
          </select>
        </label>

        <label className="campo campo--interruptor">
          <input
            type="checkbox"
            checked={soloEstancadas}
            onChange={(e) => setSoloEstancadas(e.target.checked)}
          />
          <span>{t("acciones.soloEstancadas")}</span>
        </label>
      </div>

      {/*
        No es una alarma: es información. Un GPV que cierra algo asignado al
        FSM suele estar haciendo lo correcto —vio que ya estaba resuelto—, y el
        FSM solo necesita poder mirarlo.
      */}
      {avisoCierres > 0 && !cerradasPorGpv && (
        <div className="aviso aviso--atencion" role="status">
          {t("acciones.avisoCierres", { n: avisoCierres })}{" "}
          <button
            className="boton boton--menudo boton--secundario"
            onClick={() => setCerradasPorGpv(true)}
          >
            {t("acciones.verCierres")}
          </button>
        </div>
      )}

      {cerradasPorGpv && (
        <div className="aviso" role="status">
          {t("acciones.viendoCierres")}{" "}
          <button
            className="boton boton--menudo boton--secundario"
            onClick={() => setCerradasPorGpv(false)}
          >
            {t("acciones.volverBandeja")}
          </button>
        </div>
      )}

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}

      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("acciones.antiguedad")}</th>
              <th>{t("acciones.situacion")}</th>
              <th>{t("acciones.tienda")}</th>
              <th>{t("acciones.detectadaPor")}</th>
              <th>{t("acciones.responsable")}</th>
              <th>{t("acciones.acciones")}</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="tabla__vacia">
                  {t("comun.cargando")}
                </td>
              </tr>
            )}

            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={6} className="tabla__vacia">
                  {t("acciones.vacio")}
                </td>
              </tr>
            )}

            {!cargando &&
              filas.map((f) => (
                <Fragment key={f.id}>
                  <tr className={f.estancada ? "fila--estancada" : ""}>
                    <td>
                      <strong>{t("acciones.dias", { n: f.diasAbierta })}</strong>
                      {f.estancada && (
                        <div className="distintivo distintivo--en_revision">
                          {t("acciones.estancada")}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{t(`situacion.${f.tipoSituacion}`)}</div>
                      <div className="tabla__ref">
                        {f.categoriaProducto !== "transversal" &&
                          t(`categoria.${f.categoriaProducto}`)}
                      </div>
                      {/*
                        El código de nevera se muestra aquí y no escondido en el
                        detalle: el FSM lo va a teclear en su propia aplicación
                        de neveras, y es la razón de que el dato exista.
                      */}
                      {f.codigoNevera && (
                        <div className="codigo-nevera">
                          <code>{f.codigoNevera}</code>
                          <button
                            className="boton boton--menudo boton--secundario"
                            onClick={() => void navigator.clipboard?.writeText(f.codigoNevera!)}
                            title={t("acciones.copiarCodigo")}
                          >
                            {t("acciones.copiar")}
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{f.tienda.nombre}</div>
                      <div className="tabla__ref">
                        {f.tienda.numeroReferencia}
                        {f.tienda.localidad && ` · ${f.tienda.localidad}`}
                      </div>
                    </td>
                    <td>
                      <div>{f.detectadaPor.nombre}</div>
                      <div className="tabla__ref">{f.detectadaPor.numeroTrabajador}</div>
                    </td>
                    <td>
                      <span
                        className={`distintivo distintivo--${
                          f.responsableActuar === "fsm" ? "en_revision" : "neutro"
                        }`}
                      >
                        {f.responsableActuar === "fsm"
                          ? t("acciones.paraMi")
                          : t("acciones.paraElGpv")}
                      </span>
                      {/*
                        Aviso cuando un GPV ha cerrado algo que estaba asignado
                        al FSM: sin esto, el FSM se enteraría por casualidad de
                        que su bandeja ha menguado.
                      */}
                      {f.cerradaPorRol === "comercial" && f.responsableActuar === "fsm" && (
                        <div className="tabla__ref">{t("acciones.cerradaPorGpv")}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--e2)", flexWrap: "wrap" }}>
                        {(f.estado === "abierta" || f.estado === "en_curso") && (
                          <>
                            {/*
                              En una nevera, cerrar significa «informado en mi
                              aplicación de neveras», no «nevera recogida». Con
                              la etiqueta genérica el FSM podría creer que el
                              problema físico está resuelto cuando solo se ha
                              trasladado a otro sistema.
                            */}
                            <button
                              className="boton boton--menudo boton--principal"
                              onClick={() => void cerrar(f.id, "resuelta")}
                              disabled={enCurso === f.id}
                              title={
                                f.tipoSituacion === "nevera"
                                  ? t("acciones.informadoAyuda")
                                  : undefined
                              }
                            >
                              {t(
                                f.tipoSituacion === "nevera"
                                  ? "acciones.informado"
                                  : "acciones.resolver",
                              )}
                            </button>
                            <button
                              className="boton boton--menudo boton--secundario"
                              onClick={() => void cerrar(f.id, "descartada")}
                              disabled={enCurso === f.id}
                            >
                              {t("acciones.descartar")}
                            </button>
                          </>
                        )}
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => void verHistorial(f.id)}
                        >
                          {t("acciones.historial", { n: f.comprobaciones })}
                        </button>
                        {/* Al detalle de la visita donde se detectó: es donde
                            están las evidencias y el resto del contexto. */}
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => navegar(`/visitas/${f.visitaOrigenId}`)}
                        >
                          {t("acciones.verVisita")}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/*
                    El historial completo, no solo el último estado. Es lo que
                    permite ver cuántas veces se ha vuelto y qué se dijo cada
                    vez — la razón de que las comprobaciones se acumulen en
                    lugar de sobreescribirse.
                  */}
                  {detalle === f.id && (
                    <tr>
                      <td colSpan={6} className="historial">
                        {historial.length === 0 ? (
                          <p className="tabla__vacia">{t("acciones.sinComprobaciones")}</p>
                        ) : (
                          <ol className="historial__lista">
                            {historial.map((c) => (
                              <li key={c.id}>
                                <span className="historial__fecha">
                                  {new Date(c.comprobadaEn).toLocaleDateString()}
                                </span>
                                <span className="historial__desenlace">
                                  {t(`desenlace.${c.desenlace}`)}
                                </span>
                                <span className="historial__autor">
                                  {c.autor.nombre} · {t(`rol.${c.autor.rol}`)}
                                </span>
                                {c.comentario && (
                                  <span className="historial__comentario">«{c.comentario}»</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
