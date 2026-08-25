import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";

/**
 * Detalle de una visita, en solo lectura (SPECS §6.2).
 *
 * Organizado **por categoría de producto**, como el GPV la registró y como el
 * FSM la piensa. Una lista cronológica mezclaría Dairy con Waters y obligaría a
 * reconstruir mentalmente lo que la pantalla puede agrupar.
 *
 * NO muestra la duración de la visita. Se ven las horas de inicio y fin, que
 * son parte del registro, pero no el intervalo entre ellas: el cliente decidió
 * no usar el tiempo de permanencia como métrica ni como control mientras no se
 * complete la revisión legal.
 */

type Evidencia = {
  id: string;
  tipo: "foto" | "video";
  tipoMime: string;
  duracionS: number | null;
  normalizadaEn: string | null;
  capturadaEn: string;
  url: string;
};

type Accion = {
  id: string;
  tipoSituacion: string;
  categoriaProducto: string;
  responsableActuar: "gpv" | "fsm";
  estado: string;
  detectadaEn: string;
  grupo: "incidencia" | "oportunidad" | "extraespacio";
  detalle: Record<string, unknown> | null;
  evidencias: Evidencia[];
};

type Detalle = {
  visita: {
    id: string;
    fecha: string;
    estado: string;
    planificada: boolean;
    horaInicio: string | null;
    horaFin: string | null;
    notasLibres: string | null;
  };
  tienda: {
    id: string;
    nombre: string;
    numeroReferencia: string;
    localidad: string | null;
    direccion: string | null;
    canal: string | null;
  };
  gpv: { nombre: string; numeroTrabajador: string };
  porCategoria: Record<string, Accion[]>;
  relacionResponsable: {
    haHablado: boolean;
    valoracion: string | null;
    cuestionPendiente: boolean;
    comentario: string | null;
  } | null;
  evidenciasGenerales: Evidencia[];
};

const ICONO: Record<string, string> = {
  dairy: "🥛",
  waters: "💧",
  pbb: "🍦",
  extraespacios: "🧊",
};

export function DetalleVisita() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [datos, setDatos] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await pedir<Detalle>(`/visitas/${id}/detalle`, { idioma }));
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
  }, [id, idioma, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return <p className="cargando">{t("comun.cargando")}</p>;
  if (error) {
    return (
      <div className="aviso aviso--error" role="alert">
        {error}
      </div>
    );
  }
  if (!datos) return null;

  const categorias = Object.keys(datos.porCategoria);

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <button className="boton boton--menudo boton--secundario" onClick={() => navegar(-1)}>
            ← {t("comun.volver")}
          </button>
          <h1 className="pagina__titulo">{datos.tienda.nombre}</h1>
          <p className="pagina__subtitulo">
            {datos.tienda.numeroReferencia}
            {datos.tienda.localidad && ` · ${datos.tienda.localidad}`}
            {datos.tienda.canal && ` · ${t(`canal.${datos.tienda.canal}`)}`}
          </p>
        </div>
      </header>

      <section className="tarjeta">
        <div className="cabecera-visita">
          <div>
            <span className="cabecera-visita__etiqueta">{t("detalleVisita.gpv")}</span>
            <span>{datos.gpv.nombre}</span>
            <span className="tabla__ref">{datos.gpv.numeroTrabajador}</span>
          </div>
          <div>
            <span className="cabecera-visita__etiqueta">{t("detalleVisita.fecha")}</span>
            <span>{datos.visita.fecha}</span>
          </div>
          <div>
            {/*
              Horas de inicio y fin, sin el intervalo entre ellas: el tiempo de
              permanencia no se expone como métrica (SPECS §6.2).
            */}
            <span className="cabecera-visita__etiqueta">{t("detalleVisita.horario")}</span>
            <span>
              {hora(datos.visita.horaInicio)} – {hora(datos.visita.horaFin)}
            </span>
          </div>
          <div>
            <span className="cabecera-visita__etiqueta">{t("detalleVisita.tipo")}</span>
            <span className={`distintivo distintivo--${datos.visita.planificada ? "resuelta" : "neutro"}`}>
              {t(datos.visita.planificada ? "detalleVisita.planificada" : "detalleVisita.noPlanificada")}
            </span>
          </div>
        </div>
      </section>

      {categorias.length === 0 && (
        <section className="tarjeta">
          <p className="tabla__vacia">{t("detalleVisita.sinRegistros")}</p>
        </section>
      )}

      {categorias.map((clave) => (
        <section key={clave} className="tarjeta">
          <h2 className="tarjeta__titulo">
            <span aria-hidden="true">{ICONO[clave] ?? "•"}</span>{" "}
            {clave === "extraespacios" ? t("bloque.extraespacios") : t(`categoria.${clave}`)}
          </h2>

          <div className="acciones-visita">
            {datos.porCategoria[clave]!.map((a) => (
              <article key={a.id} className="accion-registrada">
                <div className="accion-registrada__cabecera">
                  <h3 className="accion-registrada__titulo">
                    <span aria-hidden="true">
                      {a.grupo === "incidencia" ? "🔴" : a.grupo === "oportunidad" ? "🟢" : "🧊"}
                    </span>{" "}
                    {t(`situacion.${a.tipoSituacion}`)}
                  </h3>
                  <span
                    className={`distintivo distintivo--${
                      a.responsableActuar === "fsm" ? "en_revision" : "neutro"
                    }`}
                  >
                    {t(a.responsableActuar === "fsm" ? "acciones.paraMi" : "acciones.paraElGpv")}
                  </span>
                </div>

                {a.detalle && (
                  <dl className="detalle-flujo">
                    {Object.entries(a.detalle)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([campo, valor]) => (
                        <div key={campo} className="detalle-flujo__par">
                          <dt>{t(`detalleFlujo.${campo}`, { defaultValue: campo })}</dt>
                          <dd className={campo === "codigoNevera" ? "codigo-nevera" : ""}>
                            {campo === "codigoNevera" ? (
                              <code>{String(valor)}</code>
                            ) : (
                              formatear(campo, valor, t)
                            )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}

                {a.evidencias.length > 0 && (
                  <div className="evidencias">
                    {a.evidencias.map((e) => (
                      <Evidencia key={e.id} evidencia={e} />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="tarjeta">
        <h2 className="tarjeta__titulo">
          <span aria-hidden="true">👤</span> {t("responsable.titulo")}
        </h2>
        {datos.relacionResponsable ? (
          <dl className="detalle-flujo">
            <div className="detalle-flujo__par">
              <dt>{t("responsable.valoracion")}</dt>
              <dd>
                {datos.relacionResponsable.valoracion
                  ? t(`flujo.valoracion.${datos.relacionResponsable.valoracion}`)
                  : "—"}
              </dd>
            </div>
            {datos.relacionResponsable.comentario && (
              <div className="detalle-flujo__par">
                <dt>{t("responsable.cuestion")}</dt>
                <dd>«{datos.relacionResponsable.comentario}»</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="tabla__vacia">{t("responsable.sinRegistrar")}</p>
        )}
        <button
          className="boton boton--menudo boton--secundario"
          onClick={() => navegar(`/tiendas/${datos.tienda.id}/relacion`)}
        >
          {t("detalleVisita.verHistorico")}
        </button>
      </section>

      {datos.evidenciasGenerales.length > 0 && (
        <section className="tarjeta">
          <h2 className="tarjeta__titulo">{t("detalleVisita.evidenciasGenerales")}</h2>
          <div className="evidencias">
            {datos.evidenciasGenerales.map((e) => (
              <Evidencia key={e.id} evidencia={e} />
            ))}
          </div>
        </section>
      )}

      {datos.visita.notasLibres && (
        <section className="tarjeta">
          <h2 className="tarjeta__titulo">{t("detalleVisita.notas")}</h2>
          <p>{datos.visita.notasLibres}</p>
        </section>
      )}
    </>
  );
}

/**
 * Una evidencia: imagen o vídeo reproducible.
 *
 * El vídeo va con `controls` y `preload="metadata"`: sin lo segundo, abrir una
 * visita con cuatro vídeos descargaría decenas de megabytes que quizá nadie
 * llegue a ver.
 */
function Evidencia({ evidencia }: { evidencia: Evidencia }) {
  const { t } = useTranslation();

  if (evidencia.tipo === "video") {
    return (
      <figure className="evidencia">
        <video className="evidencia__video" controls preload="metadata" src={evidencia.url} />
        <figcaption className="evidencia__pie">
          {evidencia.duracionS !== null && <span>{evidencia.duracionS} s</span>}
          {/*
            Un vídeo sin normalizar puede no reproducirse en todos los
            navegadores —WebM en Safari—, así que se advierte en lugar de
            dejar al FSM ante un reproductor en negro sin explicación.
          */}
          {evidencia.normalizadaEn === null && (
            <span className="evidencia__aviso">{t("detalleVisita.sinNormalizar")}</span>
          )}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="evidencia">
      {/* `loading="lazy"`: una galería de doce fotos no debe descargarse
          entera antes de que el FSM haya bajado a verla. */}
      <a href={evidencia.url} target="_blank" rel="noreferrer">
        <img className="evidencia__imagen" src={evidencia.url} alt="" loading="lazy" />
      </a>
    </figure>
  );
}

function hora(valor: string | null) {
  if (!valor) return "—";
  return new Date(valor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Los valores del dominio se traducen; los booleanos se dicen en palabras. */
function formatear(
  campo: string,
  valor: unknown,
  t: (clave: string, opciones?: Record<string, unknown>) => string,
) {
  if (typeof valor === "boolean") return t(valor ? "comun.si" : "comun.no");
  if (typeof valor === "number") return String(valor);

  const texto = String(valor);
  const claves: Record<string, string> = {
    suficiencia: "flujo.suficiencia",
    problema: "flujo.problemaFechas",
    correccion: "flujo.correccion",
    situacion: "flujo.situacionNevera",
    tipo: "flujo.tipoExtraespacio",
    motivo: "flujo.motivoExtraespacio",
    ubicacionActual: "flujo.ubicacion",
    propuesta: "flujo.propuesta",
  };

  const prefijo = claves[campo];
  return prefijo ? t(`${prefijo}.${texto}`, { defaultValue: texto }) : texto;
}
