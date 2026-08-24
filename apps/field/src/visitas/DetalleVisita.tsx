import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import type {
  Checklist,
  Desviacion,
  IncidenciaVisita,
  TarjetaVisita,
} from "../api/tipos";
import { useSesion } from "../auth/sesion";
import { obtenerUbicacion } from "../comun/ubicacion";
import { DialogoJustificar } from "./DialogoJustificar";
import { SeccionChecklist } from "./SeccionChecklist";
import { SeccionIncidencias } from "./SeccionIncidencias";
import "./detalle.css";

/**
 * Detalle de la visita (SPECS §5.4).
 *
 * El botón de acción cambia según el estado, y en los estados terminales
 * desaparece y la pantalla pasa a solo lectura. No se oculta el contenido: el
 * comercial tiene que poder consultar lo que hizo, solo no modificarlo.
 */
export function DetalleVisita() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [visita, setVisita] = useState<TarjetaVisita | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [incidencias, setIncidencias] = useState<IncidenciaVisita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desviacion, setDesviacion] = useState<Desviacion | null>(null);
  const [justificando, setJustificando] = useState(false);
  const [notas, setNotas] = useState("");

  /**
   * La visita se localiza dentro de la vista del día en lugar de pedirla por
   * su identificador: no hay endpoint de detalle todavía, y la lista ya trae
   * todo lo que la cabecera necesita. Cuando exista, esto se sustituye sin
   * tocar el resto de la pantalla.
   */
  const cargar = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const dia = await pedir<{ visitas: TarjetaVisita[] }>("/visitas/dia", { idioma });
      const encontrada = dia.visitas.find((v) => v.visitaId === id) ?? null;
      setVisita(encontrada);

      const [lista, incidenciasVisita] = await Promise.all([
        pedir<Checklist>(`/visitas/${id}/checklist`, { idioma }),
        pedir<IncidenciaVisita[]>(`/visitas/${id}/incidencias`, { idioma }),
      ]);
      setChecklist(lista);
      setIncidencias(incidenciasVisita);
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

  async function comenzar() {
    setAccionEnCurso(true);
    setError(null);
    try {
      /**
       * La ubicación se pide pero NO se exige: si el comercial denegó el
       * permiso o el GPS no fija, la visita se registra igual. Bloquear el
       * check-in por eso dejaría a alguien sin poder trabajar por un ajuste
       * del móvil.
       */
      const ubicacion = await obtenerUbicacion();
      const respuesta = await pedir<{ visita: unknown; desviacion: Desviacion }>(
        `/visitas/${id}/comenzar`,
        {
          metodo: "POST",
          cuerpo: { ubicacion, capturadaEn: new Date().toISOString() },
        },
      );
      setDesviacion(respuesta.desviacion);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function finalizar() {
    setAccionEnCurso(true);
    setError(null);
    try {
      const ubicacion = await obtenerUbicacion();
      await pedir(`/visitas/${id}/finalizar`, {
        metodo: "POST",
        cuerpo: {
          ubicacion,
          capturadaEn: new Date().toISOString(),
          notasLibres: notas.trim() || undefined,
        },
      });
      navegar("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccionEnCurso(false);
    }
  }

  if (cargando) return <p className="cargando">{t("comun.cargando")}</p>;

  if (!visita) {
    return (
      <div className="detalle">
        <p className="cargando">{error ?? t("comun.sinConexion")}</p>
        <div className="detalle__acciones">
          <button
            className="boton boton--secundario boton--ancho"
            onClick={() => navegar("/")}
          >
            {t("comun.volver")}
          </button>
        </div>
      </div>
    );
  }

  const cerrada = visita.estado === "finalizada" || visita.estado === "no_realizada";
  const editable = visita.estado === "en_curso";

  return (
    <div className="detalle">
      <header className="detalle__cabecera">
        <button className="detalle__volver" onClick={() => navegar("/")}>
          <span aria-hidden="true">←</span> {t("visita.volver")}
        </button>

        <h1 className="detalle__nombre">{visita.tienda.nombre}</h1>
        <p className="detalle__referencia">
          {visita.tienda.numeroReferencia}
          {visita.tienda.localidad && ` · ${visita.tienda.localidad}`}
        </p>
        {visita.tienda.direccion && (
          <p className="detalle__direccion">{visita.tienda.direccion}</p>
        )}
      </header>

      <div className="detalle__cuerpo">
        {error && (
          <div className="aviso aviso--error" role="alert">
            {error}
          </div>
        )}

        {/*
          La desviación se enseña al comercial en el momento, no solo se deja
          en el rastro del supervisor: si se ha equivocado de tienda, es ahora
          cuando puede corregirlo.
        */}
        {desviacion?.desviada && desviacion.metros !== null && (
          <div className="aviso aviso--sinconexion" role="status">
            {t("visita.desviacionAviso", { metros: desviacion.metros })}
          </div>
        )}

        {cerrada && (
          <div className="detalle__cerrada">
            <strong>
              {visita.estado === "finalizada"
                ? t("visita.finalizada")
                : t("visita.noRealizada")}
            </strong>
            <span>{t("visita.soloLectura")}</span>
            {visita.incompleta && <span>{t("visita.incompletaAviso")}</span>}
          </div>
        )}

        <SeccionChecklist
          checklist={checklist}
          editable={editable}
          visitaId={id!}
          alCambiar={cargar}
        />

        <SeccionIncidencias
          incidencias={incidencias}
          editable={editable}
          visitaId={id!}
          alCambiar={cargar}
        />

        {editable && (
          <section className="seccion">
            <h2 className="seccion__titulo">{t("visita.notas")}</h2>
            <textarea
              className="campo__control"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={t("visita.notasPlaceholder")}
              maxLength={4000}
            />
          </section>
        )}
      </div>

      {!cerrada && (
        <div className="detalle__acciones">
          {visita.estado === "pendiente" && (
            <>
              <button
                className="boton boton--principal boton--ancho"
                onClick={() => void comenzar()}
                disabled={accionEnCurso}
              >
                {accionEnCurso ? t("visita.comenzando") : t("visita.comenzar")}
              </button>
              {/*
                Justificar solo tiene sentido en una visita planificada: una
                extra que no se hizo simplemente no se crea.
              */}
              {visita.planificada && (
                <button
                  className="boton boton--aviso boton--ancho"
                  onClick={() => setJustificando(true)}
                  disabled={accionEnCurso}
                >
                  {t("visita.noPuedoVisitarla")}
                </button>
              )}
            </>
          )}

          {editable && (
            <button
              className="boton boton--principal boton--ancho"
              onClick={() => void finalizar()}
              disabled={accionEnCurso}
            >
              {accionEnCurso ? t("visita.finalizando") : t("visita.finalizar")}
            </button>
          )}
        </div>
      )}

      {justificando && (
        <DialogoJustificar
          visitaId={id!}
          alCerrar={() => setJustificando(false)}
          alJustificar={() => navegar("/")}
        />
      )}
    </div>
  );
}
