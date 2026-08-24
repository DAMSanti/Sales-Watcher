import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LOCALE } from "@sw/shared";
import { ErrorApi, pedir } from "../api/cliente";
import type { TarjetaVisita as Tarjeta, VistaDelDia as Datos } from "../api/tipos";
import { useSesion } from "../auth/sesion";
import { guardarCache, leerCache } from "../offline/almacen";
import { IndicadorSincronizacion } from "../offline/IndicadorSincronizacion";
import { useSincronizacion } from "../offline/ContextoSincronizacion";
import { precargarJornada } from "../offline/precarga";
import { TarjetaVisita } from "./TarjetaVisita";
import "./dia.css";

export function VistaDelDia() {
  const { t } = useTranslation();
  const { idioma, salir } = useSesion();

  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const [desdeCache, setDesdeCache] = useState(false);
  const { pendientes } = useSincronizacion();

  const cargar = useCallback(
    async (senal?: AbortSignal) => {
      setError(null);
      try {
        const respuesta = await pedir<Datos>("/visitas/dia", { idioma, senal });
        setDatos(respuesta);
        setSinRed(false);
        setDesdeCache(false);
        /** Se guarda para poder abrir la app sin cobertura mañana. */
        void guardarCache("visitas/dia", respuesta);
        /**
         * Y se precarga el detalle de cada visita abierta. El comercial pierde
         * la señal DENTRO de la tienda: descargar el checklist al abrir la
         * visita llegaría tarde.
         */
        void precargarJornada(respuesta.visitas, idioma);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (e instanceof ErrorApi && e.esFalloDeRed) {
          /**
           * Sin cobertura NO se muestra un error: se marca el estado y se
           * conserva lo que ya hubiera en pantalla. El comercial en un sótano
           * necesita seguir viendo su ruta, no un mensaje rojo.
           */
          setSinRed(true);
          /**
           * Sin red se recurre a lo último descargado. Es la diferencia entre
           * un comercial que puede consultar su ruta en un sótano y uno que ve
           * una pantalla vacía.
           */
          const guardado = await leerCache<Datos>("visitas/dia");
          if (guardado) {
            setDatos(guardado.datos);
            setDesdeCache(true);
          }
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setCargando(false);
      }
    },
    [idioma],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  /** Al recuperar cobertura se recarga solo: el comercial no debería tener
   *  que acordarse de refrescar. */
  useEffect(() => {
    const alVolver = () => void cargar();
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, [cargar]);

  /**
   * Al vaciarse la cola se recarga: lo que se aplicó en el servidor tiene que
   * reflejarse en la pantalla sin que el comercial toque nada.
   */
  useEffect(() => {
    if (pendientes.length === 0) void cargar();
  }, [pendientes.length, cargar]);

  if (cargando && !datos) {
    return <p className="cargando">{t("comun.cargando")}</p>;
  }

  const resumen = datos?.resumen;
  const hechas = (resumen?.finalizadas ?? 0) + (resumen?.noRealizadas ?? 0);

  return (
    <div className="dia">
      <header className="dia__cabecera">
        <div className="dia__cabecera-fila">
          <div>
            <h1 className="dia__titulo">{t("dia.titulo")}</h1>
            {datos && (
              <p className="dia__fecha">{formatearFecha(datos.fecha, idioma)}</p>
            )}
          </div>
          <button
            type="button"
            className="boton boton--sutil dia__salir"
            onClick={salir}
          >
            {t("comun.salir")}
          </button>
        </div>

        {resumen && resumen.total > 0 && (
          <div className="dia__progreso">
            <div
              className="dia__barra"
              role="progressbar"
              aria-valuenow={hechas}
              aria-valuemin={0}
              aria-valuemax={resumen.total}
            >
              <div
                className="dia__barra-relleno"
                style={{ width: `${(hechas / resumen.total) * 100}%` }}
              />
            </div>
            <p className="dia__progreso-texto">
              {t("dia.progreso", { hechas, total: resumen.total })}
            </p>
          </div>
        )}
      </header>

      <IndicadorSincronizacion />

      {desdeCache && (
        <div className="aviso aviso--sinconexion dia__aviso" role="status">
          <span>{t("sync.desdeCache")}</span>
        </div>
      )}

      {sinRed && !desdeCache && (
        <div className="aviso aviso--sinconexion dia__aviso" role="status">
          <strong>{t("comun.sinConexion")}</strong>
          <span>{t("comun.sinConexionAyuda")}</span>
        </div>
      )}

      {error && (
        <div className="aviso aviso--error dia__aviso" role="alert">
          <span>{error}</span>
          <button type="button" className="boton boton--sutil" onClick={() => void cargar()}>
            {t("comun.reintentar")}
          </button>
        </div>
      )}

      {resumen && resumen.sinJustificar > 0 && (
        <div className="dia__alerta" role="status">
          {t("dia.sinJustificar", { count: resumen.sinJustificar })}
        </div>
      )}

      <main className="dia__lista">
        {datos && datos.visitas.length === 0 ? (
          <div className="dia__vacio">
            <p className="dia__vacio-titulo">{t("dia.vacio")}</p>
            <p className="dia__vacio-ayuda">{t("dia.vacioAyuda")}</p>
          </div>
        ) : (
          datos?.visitas.map((visita) => (
            <TarjetaVisita
              key={visita.visitaId ?? visita.tienda.id}
              visita={visita}
              idioma={idioma}
            />
          ))
        )}
      </main>

      {/*
        Botón siempre visible, como pide SPECS §5.2. Flotante sobre la lista
        para que siga alcanzable con el pulgar tras desplazarse por una ruta
        larga.
      */}
      <div className="dia__accion">
        <Link to="/anadir" className="boton boton--principal boton--ancho">
          <span aria-hidden="true">+</span> {t("dia.anadirVisita")}
        </Link>
      </div>
    </div>
  );
}

/**
 * Formatea la fecha de la jornada.
 *
 * ⚠️ Chromium NO incluye `eu-ES` en sus datos de internacionalización:
 * `Intl.DateTimeFormat.supportedLocalesOf(["eu-ES"])` devuelve vacío y el
 * navegador cae al idioma por defecto. Un comercial vasco ve la interfaz en
 * euskera pero la fecha en castellano.
 *
 * Se deja así a propósito: coincide con la cadena de respaldo declarada del
 * sistema (eu → es), y las alternativas —traducir los meses a mano o cargar
 * datos de ICU adicionales— añaden peso y superficie de error para arreglar
 * una línea de texto. Documentado para que nadie lo persiga como un fallo.
 * Catalán y francés sí funcionan.
 */
function formatearFecha(fecha: string, idioma: keyof typeof LOCALE) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  // Se construye en UTC para que la fecha local no se desplace al formatear.
  const valor = new Date(Date.UTC(anio!, mes! - 1, dia!));
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(valor);
}
