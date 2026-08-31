import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import type {
  Accion,
  AccionDeVisita,
  CategoriaProducto,
  Checklist,
  RelacionResponsable,
  ResumenVisita,
  TarjetaVisita,
} from "../api/tipos";
import { useSesion } from "../auth/sesion";
import { obtenerUbicacion } from "../comun/ubicacion";
import { guardarCache, leerCache } from "../offline/almacen";
import { ejecutar } from "../offline/cola";
import { IndicadorSincronizacion } from "../offline/IndicadorSincronizacion";
import { DialogoJustificar } from "./DialogoJustificar";
import { SeccionChecklist } from "./SeccionChecklist";
import { DialogoResumen } from "./DialogoResumen";
import { PanelCategoria } from "./PanelCategoria";
import { SeccionPendientes } from "./SeccionPendientes";
import { SeccionRegistradoEnVisita } from "./SeccionRegistradoEnVisita";
import { SeccionResponsable } from "./SeccionResponsable";
import { ICONO_CATEGORIA } from "./flujos";
import "./detalle.css";
import "./acciones.css";

const CATEGORIAS: CategoriaProducto[] = ["dairy", "waters", "pbb"];

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
  /**
   * Distingue "no hay checklist" de "no se pudo cargar".
   *
   * Sin esta diferencia, una visita abierta sin cobertura mostraba "Esta
   * tienda no tiene checklist configurado", que es MENTIRA: el checklist
   * existe y no se pudo traer. El comercial concluiría que no hay nada que
   * hacer y cerraría la visita sin completarla.
   */
  const [datosDisponibles, setDatosDisponibles] = useState(true);

  // ── El ciclo de acciones ───────────────────────────────────────────
  /** Lo detectado en ESTA visita, para los contadores de cada flujo. */
  const [registradas, setRegistradas] = useState<Record<string, number>>({});
  /** Lo que sigue abierto en la tienda de visitas ANTERIORES. */
  const [pendientes, setPendientes] = useState<Accion[]>([]);
  const [registradasVisita, setRegistradasVisita] = useState<AccionDeVisita[]>([]);
  const [relacion, setRelacion] = useState<RelacionResponsable | null>(null);
  /** Categoría abierta. `null` = pantalla principal con las tres. */
  const [categoriaAbierta, setCategoriaAbierta] = useState<CategoriaProducto | null>(null);
  const [resumen, setResumen] = useState<ResumenVisita | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justificando, setJustificando] = useState(false);
  const [notas, setNotas] = useState("");
  /** Se muestra cuando la acción quedó guardada en el dispositivo. */
  const [encolado, setEncolado] = useState(false);

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

      const [lista, resumenVisita] = await Promise.all([
        pedir<Checklist>(`/visitas/${id}/checklist`, { idioma }),
        pedir<ResumenVisita>(`/visitas/${id}/resumen`, { idioma }),
      ]);
      setChecklist(lista);
      setResumen(resumenVisita);
      setRelacion(
        resumenVisita.relacionResponsable
          ? { id: "", ...resumenVisita.relacionResponsable, comentario: null }
          : null,
      );

      // Contadores por flujo, aplanando el resumen que viene por categoría.
      const cuenta: Record<string, number> = {};
      for (const bloque of Object.values(resumenVisita.porCategoria)) {
        for (const [tipo, n] of Object.entries(bloque.situaciones)) {
          cuenta[tipo] = (cuenta[tipo] ?? 0) + n;
        }
      }
      setRegistradas(cuenta);

      /**
       * Lo abierto se pide por TIENDA, no por visita: una acción pertenece a la
       * tienda y sobrevive a la visita que la detectó. Se excluye lo de esta
       * misma visita, que ya está en los contadores de arriba y volvería a
       * aparecer como "pendiente de antes" sin serlo.
       */
      if (encontrada?.tienda.id) {
        const abiertas = await pedir<Accion[]>(
          `/tiendas/${encontrada.tienda.id}/acciones`,
          { idioma },
        );
        setPendientes(abiertas.filter((a) => a.visitaOrigenId !== id));
        void guardarCache(`acciones/${encontrada.tienda.id}`, abiertas);
      }

      /**
       * Solo hace falta con la visita en curso: es cuando se puede borrar un
       * misclick. Pedirlo siempre gastaría una consulta que nadie va a usar en
       * una visita ya cerrada.
       */
      if (encontrada?.estado === "en_curso") {
        setRegistradasVisita(await pedir<AccionDeVisita[]>(`/visitas/${id}/acciones`, { idioma }));
      }

      setDatosDisponibles(true);
      void guardarCache(`visita/${id}`, { lista });
    } catch (e) {
      if (e instanceof ErrorApi && e.esFalloDeRed) {
        const guardado = await leerCache<{ lista: Checklist }>(`visita/${id}`);

        if (guardado) {
          setChecklist(guardado.datos.lista);
          setDatosDisponibles(true);
        } else {
          /** Nunca se abrió esta visita con cobertura: no hay nada que mostrar. */
          setDatosDisponibles(false);
        }
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
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
      const capturadaEn = new Date().toISOString();

      /**
       * La desviación se sigue calculando en el servidor (señal para el
       * FSM/backoffice), pero desde v0.7 deja de mostrarse al GPV: el cliente
       * no quiere ninguna interacción visible de ubicación en el flujo de
       * visita (SPECS §3.2).
       */
      const resultado = await ejecutar({
        ruta: `/visitas/${id}/comenzar`,
        tipo: "visita.comenzar",
        cuerpo: { ubicacion, capturadaEn },
        /** El lote referencia la visita en el cuerpo, no en la URL. */
        carga: { visita: { id }, ubicacion, capturadaEn },
        descripcion: visita?.tienda.nombre,
      });

      if (resultado.via === "directo") {
        await cargar();
      } else {
        /**
         * Sin cobertura no hay respuesta del servidor, así que la pantalla
         * avanza por su cuenta: el comercial acaba de entrar en la tienda y
         * tiene que poder seguir con el checklist.
         */
        setEncolado(true);
        setVisita((v) => (v ? { ...v, estado: "en_curso" } : v));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccionEnCurso(false);
    }
  }

  /**
   * Pide el resumen y lo enseña. No bloquea el cierre: si el resumen no se
   * puede traer —sin cobertura, por ejemplo— el diálogo aparece igual con lo
   * último que se cargó, y el GPV puede cerrar. Impedir cerrar una visita
   * porque no hay red sería exactamente el problema que el modo offline existe
   * para evitar.
   */
  async function pedirCierre() {
    setConfirmandoCierre(true);
    try {
      const actual = await pedir<ResumenVisita>(`/visitas/${id}/resumen`, { idioma });
      setResumen(actual);
    } catch {
      /* Se conserva el resumen anterior. */
    }
  }

  async function finalizar() {
    setAccionEnCurso(true);
    setError(null);
    try {
      const ubicacion = await obtenerUbicacion();
      const capturadaEn = new Date().toISOString();
      const notasLibres = notas.trim() || undefined;

      await ejecutar({
        ruta: `/visitas/${id}/finalizar`,
        tipo: "visita.finalizar",
        cuerpo: { ubicacion, capturadaEn, notasLibres },
        carga: { visita: { id }, ubicacion, capturadaEn, notasLibres },
        descripcion: visita?.tienda.nombre,
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
        <IndicadorSincronizacion />

        {encolado && (
          <div className="aviso aviso--sinconexion" role="status">
            {t("sync.guardadoLocal")}
          </div>
        )}

        {error && (
          <div className="aviso aviso--error" role="alert">
            {error}
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

        {/*
          Dentro de una categoría, la pantalla se dedica a ella entera. En un
          móvil sostenido con una mano, mostrar las tres categorías abiertas a
          la vez obligaría a desplazarse mucho justo cuando el GPV tiene poco
          tiempo y el lineal delante.
        */}
        {categoriaAbierta ? (
          <PanelCategoria
            categoria={categoriaAbierta}
            visitaId={id!}
            nombreTienda={visita.tienda.nombre}
            registradas={registradas}
            alVolver={() => setCategoriaAbierta(null)}
            alRegistrar={cargar}
          />
        ) : (
          <>
            {/* Las tres categorías del boceto. */}
            <nav className="categorias" aria-label={t("visita.categorias")}>
              {CATEGORIAS.map((c) => {
                const bloque = resumen?.porCategoria[c];
                const total = bloque
                  ? bloque.incidencias + bloque.oportunidades
                  : 0;
                return (
                  <button
                    key={c}
                    className="categoria__tarjeta"
                    onClick={() => setCategoriaAbierta(c)}
                    disabled={!editable}
                  >
                    <span className="categoria__icono" aria-hidden="true">
                      {ICONO_CATEGORIA[c]}
                    </span>
                    <span className="categoria__nombre">{t(`categoria.${c}`)}</span>
                    {total > 0 && <span className="categoria__contador">{total}</span>}
                  </button>
                );
              })}
            </nav>

            <SeccionPendientes
              acciones={pendientes}
              visitaId={id!}
              editable={editable}
              alComprobar={cargar}
            />

            <SeccionRegistradoEnVisita
              acciones={registradasVisita}
              visitaId={id!}
              editable={editable}
              alEliminar={cargar}
            />

            {/* Transversal: fuera de las categorías porque en cada punto de
                venta hay un único encargado. */}
            <SeccionResponsable
              relacion={relacion}
              visitaId={id!}
              editable={editable}
              alGuardar={cargar}
            />

            {/* El checklist solo aparece si está encendido. Apagado no deja
                ni rastro: una sección vacía invitaría a preguntarse qué falta. */}
            {checklist?.activo !== false && (
              <SeccionChecklist
                checklist={checklist}
                disponible={datosDisponibles}
                editable={editable}
                visitaId={id!}
                alCambiar={cargar}
              />
            )}
          </>
        )}

        {editable && !categoriaAbierta && (
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
                Cancelar con motivo + comentario, planificada o no (mismo
                sistema, mismo catálogo de motivos): el cliente lo quiere igual
                para las dos, para que quede constancia de por qué no se hizo
                incluso en una visita que el propio GPV había añadido.
              */}
              <button
                className="boton boton--aviso boton--ancho"
                onClick={() => setJustificando(true)}
                disabled={accionEnCurso}
              >
                {t("visita.noPuedoVisitarla")}
              </button>
            </>
          )}

          {editable && !categoriaAbierta && (
            <button
              className="boton boton--principal boton--ancho"
              onClick={() => void pedirCierre()}
              disabled={accionEnCurso}
            >
              {t("visita.finalizar")}
            </button>
          )}
        </div>
      )}

      {confirmandoCierre && (
        <DialogoResumen
          resumen={resumen}
          cerrando={accionEnCurso}
          alCancelar={() => setConfirmandoCierre(false)}
          alConfirmar={() => void finalizar()}
        />
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
