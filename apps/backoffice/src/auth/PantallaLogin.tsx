import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi } from "../api/cliente";
import { useSesion } from "./sesion";
import "./login.css";

export function PantallaLogin() {
  const { t } = useTranslation();
  const { entrar } = useSesion();

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
          : String(e),
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="acceso">
      <div className="acceso__caja">
        <header className="acceso__cabecera">
          <div className="acceso__marca" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40">
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
          <div>
            <h1 className="acceso__titulo">Sales Watcher</h1>
            <p className="acceso__subtitulo">{t("login.titulo")}</p>
          </div>
        </header>

        <form onSubmit={enviar} className="acceso__form">
          <label className="campo">
            <span className="campo__etiqueta">{t("login.numero")}</span>
            <input
              className="campo__control"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              autoComplete="username"
              autoFocus
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
            <p className="acceso__error" role="alert">
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
          Aviso explícito de a quién va dirigida la pantalla. Un comercial que
          entrase aquí vería 403 en cada consulta sin saber por qué: el rol
          existe y la contraseña es correcta, simplemente no es su aplicación.
        */}
        <p className="acceso__nota">{t("login.soloGestion")}</p>
      </div>
    </main>
  );
}
