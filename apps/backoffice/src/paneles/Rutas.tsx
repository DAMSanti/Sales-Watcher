import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";

type Comercial = { id: string; numeroTrabajador: string; nombre: string; zonaCodigo: string | null };

type FilaRuta = {
  ruta: { id: string; ordenSugerido: number | null; fecha: string };
  tienda: { id: string; nombre: string; numeroReferencia: string };
  comercial: { id: string; nombre: string; numeroTrabajador: string };
  estadoVisita: string | null;
};

type Tienda = { id: string; nombre: string; numeroReferencia: string; localidad: string | null };

function manana() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Planificación de rutas (SPECS §6.1).
 *
 * Asignación manual y sin franjas horarias: el orden es sugerido y el comercial
 * organiza su jornada como quiera.
 */
export function Rutas() {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [comercialId, setComercialId] = useState("");
  const [fecha, setFecha] = useState(manana());

  const [asignadas, setAsignadas] = useState<Tienda[]>([]);
  const [existentes, setExistentes] = useState<FilaRuta[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Tienda[]>([]);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    void pedir<{ usuarios: Comercial[] }>("/usuarios?rol=comercial&limite=200", { idioma })
      .then((r) => setComerciales(r.usuarios))
      .catch(() => setError(t("comun.sinConexion")));
  }, [idioma, t]);

  /** Ruta ya asignada para ese comercial y día. */
  const cargarRuta = useCallback(async () => {
    if (!comercialId) return;
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const filas = await pedir<FilaRuta[]>(
        `/rutas?usuarioId=${comercialId}&fecha=${fecha}`,
        { idioma },
      );
      setExistentes(filas);
      setAsignadas(
        filas.map((f) => ({ ...f.tienda, localidad: null })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [comercialId, fecha, idioma]);

  useEffect(() => {
    void cargarRuta();
  }, [cargarRuta]);

  useEffect(() => {
    const consulta = busqueda.trim();
    if (consulta.length < 2) {
      setResultados([]);
      return;
    }
    const temporizador = setTimeout(() => {
      void pedir<{ tiendas: Array<{ tienda: Tienda }> }>(
        `/tiendas?texto=${encodeURIComponent(consulta)}&limite=15`,
        { idioma },
      )
        .then((r) => setResultados(r.tiendas.map((x) => x.tienda)))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(temporizador);
  }, [busqueda, idioma]);

  async function planificar() {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await pedir<{ asignadas: number }>("/rutas", {
        metodo: "POST",
        cuerpo: {
          usuarioId: comercialId,
          fecha,
          tiendaIds: asignadas.map((t) => t.id),
        },
      });
      setAviso(t("rutas.asignadas", { n: r.asignadas }));
      await cargarRuta();
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.codigo === 409
          ? t("rutas.bloqueada")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Una visita ya iniciada bloquea la replanificación. Se detecta aquí para
   * deshabilitar el botón, pero la API lo rechaza igualmente: borrar una ruta
   * cuyo comercial ya está en la tienda destruiría actividad real.
   */
  const hayIniciadas = existentes.some(
    (f) => f.estadoVisita && f.estadoVisita !== "pendiente",
  );

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("rutas.titulo")}</h1>
          <p className="pagina__subtitulo">{t("rutas.subtitulo")}</p>
        </div>
      </header>

      <div className="filtros">
        <label className="campo" style={{ minWidth: "260px" }}>
          <span className="campo__etiqueta">{t("rutas.comercial")}</span>
          <select
            className="campo__control"
            value={comercialId}
            onChange={(e) => setComercialId(e.target.value)}
          >
            <option value="">{t("rutas.elegirComercial")}</option>
            {comerciales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numeroTrabajador} · {c.nombre}
                {c.zonaCodigo ? ` (${c.zonaCodigo})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("rutas.fecha")}</span>
          <input
            className="campo__control"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>

        <button
          className="boton boton--principal"
          onClick={() => void planificar()}
          disabled={!comercialId || guardando || hayIniciadas}
        >
          {guardando ? t("comun.guardando") : t("rutas.planificar")}
        </button>
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}
      {aviso && (
        <div
          className="aviso"
          style={{
            background: "var(--estado-fin-fondo)",
            color: "var(--estado-fin-texto)",
          }}
        >
          {aviso}
        </div>
      )}
      {hayIniciadas && <div className="aviso aviso--atencion">{t("rutas.bloqueada")}</div>}

      {comercialId && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--e4)",
            alignItems: "start",
          }}
        >
          <div className="tarjeta">
            <h2 className="tarjeta__titulo">
              {t("rutas.tiendas")} · {asignadas.length}
            </h2>
            {cargando && <p className="tabla__vacia">{t("comun.cargando")}</p>}
            {!cargando && asignadas.length === 0 && (
              <p className="tabla__vacia">{t("comun.vacio")}</p>
            )}
            <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--e2)" }}>
              {asignadas.map((tienda, indice) => {
                const existente = existentes.find((f) => f.tienda.id === tienda.id);
                return (
                  <li
                    key={tienda.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--e3)",
                      padding: "var(--e2) var(--e3)",
                      background: "var(--superficie-alt)",
                      borderRadius: "var(--radio-sm)",
                    }}
                  >
                    <span className="tabla__num" style={{ minWidth: "22px", fontWeight: 700 }}>
                      {indice + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>{tienda.nombre}</div>
                      <div className="tabla__ref">{tienda.numeroReferencia}</div>
                    </div>
                    {existente?.estadoVisita && existente.estadoVisita !== "pendiente" && (
                      <span className="distintivo distintivo--neutro">
                        {existente.estadoVisita}
                      </span>
                    )}
                    <button
                      className="boton boton--menudo boton--secundario"
                      onClick={() =>
                        setAsignadas(asignadas.filter((x) => x.id !== tienda.id))
                      }
                      disabled={hayIniciadas}
                    >
                      {t("rutas.quitar")}
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="metrica__pie" style={{ marginTop: "var(--e3)" }}>
              {t("rutas.sustituye")}
            </p>
          </div>

          <div className="tarjeta">
            <h2 className="tarjeta__titulo">{t("rutas.anadirTienda")}</h2>
            <input
              className="campo__control"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("crud.buscar")}
              style={{ width: "100%", marginBottom: "var(--e3)" }}
            />
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--e2)" }}>
              {resultados
                .filter((r) => !asignadas.some((a) => a.id === r.id))
                .map((tienda) => (
                  <li key={tienda.id}>
                    <button
                      className="boton boton--secundario boton--ancho"
                      style={{ justifyContent: "flex-start", textAlign: "left" }}
                      onClick={() => setAsignadas([...asignadas, tienda])}
                      disabled={hayIniciadas}
                    >
                      <span style={{ flex: 1 }}>
                        {tienda.nombre}
                        <span className="tabla__ref"> · {tienda.numeroReferencia}</span>
                      </span>
                      <span aria-hidden="true">+</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
