import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { IDIOMAS, NOMBRE_IDIOMA, type Idioma } from "@sw/shared";
import { ErrorApi } from "../api/cliente";
import { useSesion } from "./sesion";
import "./login.css";

export function PantallaLogin() {
  const { t, i18n } = useTranslation();
  const { entrar, idioma, fijarIdioma } = useSesion();

  const [numero, setNumero] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(numero.trim(), password);
    } catch (e) {
      setError(
        e instanceof ErrorApi
          ? e.esFalloDeRed
            ? t("comun.sinConexion")
            : e.message
          : t("comun.sinConexion"),
      );
    } finally {
      setEnviando(false);
    }
  }

  function cambiarIdioma(nuevo: Idioma) {
    fijarIdioma(nuevo);
    void i18n.changeLanguage(nuevo);
  }

  return (
    <main className="login">
      <div className="login__caja">
        <header className="login__cabecera">
          {/* Marca propia de la aplicación. Sin logotipo ni nombre de empresa. */}
          <div className="login__marca" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="44" height="44">
              <rect width="40" height="40" rx="10" fill="var(--azul-600)" />
              <path
                d="M12 21.5l5.2 5.2L28.5 15.4"
                fill="none"
                stroke="white"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="login__titulo">{t("app.nombre")}</h1>
        </header>

        <form onSubmit={enviar} className="login__form">
          <label className="campo">
            <span className="campo__etiqueta">{t("login.numeroTrabajador")}</span>
            <input
              className="campo__control"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              /**
               * Teclado numérico sin autocorrección: el número de trabajador
               * son dígitos, y el corrector del móvil lo destroza.
               */
              inputMode="numeric"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              required
            />
          </label>

          <label className="campo">
            <span className="campo__etiqueta">{t("login.password")}</span>
            <input
              className="campo__control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="boton boton--principal boton--ancho"
            disabled={enviando || !numero.trim() || !password}
          >
            {enviando ? t("login.entrando") : t("login.entrar")}
          </button>
        </form>

        {/*
          Selector de idioma ANTES de tener sesión: si solo estuviera dentro,
          un comercial que no lee castellano no podría ni entender la pantalla
          en la que tiene que escribir su número.
        */}
        <div className="login__idiomas">
          <span className="login__idiomas-etiqueta">{t("login.idioma")}</span>
          <div className="login__idiomas-lista">
            {IDIOMAS.map((codigo) => (
              <button
                key={codigo}
                type="button"
                className={`chip ${idioma === codigo ? "chip--activo" : ""}`}
                onClick={() => cambiarIdioma(codigo)}
                aria-pressed={idioma === codigo}
              >
                {NOMBRE_IDIOMA[codigo]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
