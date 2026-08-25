import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ErrorApi, pedir } from "../api/cliente";
import "./detalle.css";

type Resultado = {
  tienda: {
    id: string;
    nombre: string;
    numeroReferencia: string;
    localidad: string | null;
    direccion: string | null;
  };
};

/**
 * Inicio de visita por código o por nombre (SPECS §5.3).
 *
 * Las dos vías están al mismo nivel: el código `350…` es la más rápida cuando
 * se conoce, y el nombre no debe ser el camino de segunda para quien no lo
 * recuerda estando delante de la tienda.
 *
 * Al elegir un resultado NO se inicia la visita: se muestra una confirmación
 * con el código y el nombre. Los códigos se parecen entre sí y una visita
 * empezada en la tienda equivocada queda inmutable.
 */
export function BuscadorTiendas() {
  const { t } = useTranslation();
  const navegar = useNavigate();

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Tienda elegida, pendiente de confirmar.
   *
   * El boceto describe una confirmación visual antes de iniciar: el GPV teclea
   * el código, la aplicación resuelve el nombre y él comprueba que es la
   * tienda correcta. Iniciar directamente al tocar un resultado ahorraría un
   * toque y abriría la puerta a empezar una visita en la tienda equivocada
   * —los códigos se parecen entre sí— que luego es inmutable.
   */
  const [elegida, setElegida] = useState<Resultado["tienda"] | null>(null);

  /**
   * Retardo antes de consultar: sin él, cada pulsación lanzaría una petición y
   * en una red móvil lenta las respuestas llegarían desordenadas, mostrando
   * resultados de un texto que el comercial ya cambió.
   */
  useEffect(() => {
    const consulta = texto.trim();
    if (consulta.length < 2) {
      setResultados([]);
      return;
    }

    const control = new AbortController();
    const temporizador = setTimeout(() => {
      setBuscando(true);
      pedir<{ tiendas: Resultado[] }>(
        `/tiendas?texto=${encodeURIComponent(consulta)}&limite=25`,
        { senal: control.signal },
      )
        .then((r) => setResultados(r.tiendas))
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(
            e instanceof ErrorApi && e.esFalloDeRed
              ? t("comun.sinConexion")
              : String(e),
          );
        })
        .finally(() => setBuscando(false));
    }, 300);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [texto, t]);

  async function iniciar() {
    if (!elegida) return;
    setCreando(true);
    setError(null);
    try {
      const visita = await pedir<{ id: string }>("/visitas", {
        metodo: "POST",
        cuerpo: { tiendaId: elegida.id },
      });
      navegar(`/visita/${visita.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreando(false);
    }
  }

  /**
   * La pantalla de confirmación.
   *
   * Muestra el código en grande —es lo que el GPV acaba de teclear y lo que
   * puede haber confundido— y el nombre debajo, que es lo que de verdad le
   * dice si está en la tienda correcta.
   */
  if (elegida) {
    return (
      <div className="detalle">
        <header className="detalle__cabecera">
          <button className="detalle__volver" onClick={() => setElegida(null)}>
            <span aria-hidden="true">←</span> {t("buscador.otraTienda")}
          </button>
        </header>

        <div className="detalle__cuerpo">
          <div className="confirmacion">
            <span className="confirmacion__codigo">{elegida.numeroReferencia}</span>
            <h2 className="confirmacion__nombre">{elegida.nombre}</h2>
            {(elegida.direccion || elegida.localidad) && (
              <p className="confirmacion__direccion">
                {[elegida.direccion, elegida.localidad].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {error && (
            <div className="aviso aviso--error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="detalle__acciones">
          <button
            className="boton boton--principal boton--ancho"
            onClick={() => void iniciar()}
            disabled={creando}
          >
            {creando ? t("visita.comenzando") : t("buscador.iniciarVisita")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="detalle">
      <header className="detalle__cabecera">
        <button className="detalle__volver" onClick={() => navegar("/")}>
          <span aria-hidden="true">←</span> {t("visita.volver")}
        </button>
        <h1 className="detalle__nombre">{t("buscador.titulo")}</h1>
      </header>

      <div className="detalle__cuerpo">
        <input
          className="campo__control"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t("buscador.placeholder")}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
        />

        {error && (
          <div className="aviso aviso--error" role="alert">
            {error}
          </div>
        )}

        {texto.trim().length < 2 && (
          <p className="seccion__vacio">{t("buscador.escribeAlgo")}</p>
        )}

        {buscando && <p className="seccion__vacio">{t("comun.cargando")}</p>}

        {!buscando && texto.trim().length >= 2 && resultados.length === 0 && (
          <p className="seccion__vacio">{t("buscador.sinResultados")}</p>
        )}

        <ul className="incidencias">
          {resultados.map(({ tienda }) => (
            <li key={tienda.id}>
              <button className="resultado" onClick={() => setElegida(tienda)}>
                <span className="resultado__nombre">{tienda.nombre}</span>
                <span className="resultado__meta">
                  {tienda.numeroReferencia}
                  {tienda.localidad && ` · ${tienda.localidad}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
