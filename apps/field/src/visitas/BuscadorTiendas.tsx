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
 * Buscador para "Añadir visita" (SPECS §5.3).
 *
 * Busca por nombre y por número de referencia: el comercial unas veces recuerda
 * el nombre de la tienda y otras solo lleva apuntada la referencia.
 */
export function BuscadorTiendas() {
  const { t } = useTranslation();
  const navegar = useNavigate();

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function crear(tiendaId: string) {
    setCreando(tiendaId);
    setError(null);
    try {
      const visita = await pedir<{ id: string }>("/visitas", {
        metodo: "POST",
        cuerpo: { tiendaId },
      });
      navegar(`/visita/${visita.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreando(null);
    }
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
              <button
                className="resultado"
                onClick={() => void crear(tienda.id)}
                disabled={creando !== null}
              >
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
