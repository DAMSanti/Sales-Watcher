import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi } from "../api/cliente";
import { useSesion } from "./sesion";
import "./login.css";

/**
 * Cambio forzado de contraseña.
 *
 * Se muestra en lugar de la app entera mientras el perfil tenga
 * `requiereCambioPassword`. No es solo cosmético: la API veta todos los demás
 * endpoints en ese estado, así que enseñar la vista del día produciría una
 * pantalla que falla en cada petición.
 */
export function PantallaCambioPassword() {
  const { t } = useTranslation();
  const { cambiarPassword, salir } = useSesion();

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cortaDemas = nueva.length > 0 && nueva.length < 10;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const valido = actual && nueva.length >= 10 && nueva === repetida;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva);
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
    <main className="login">
      <div className="login__caja">
        <header className="login__cabecera">
          <h1 className="login__titulo">{t("password.titulo")}</h1>
        </header>

        <p className="login__explicacion">{t("password.explicacion")}</p>

        <form onSubmit={enviar} className="login__form">
          <label className="campo">
            <span className="campo__etiqueta">{t("password.actual")}</span>
            <input
              className="campo__control"
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="campo">
            <span className="campo__etiqueta">{t("password.nueva")}</span>
            <input
              className="campo__control"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              required
            />
            <span className="campo__ayuda">{t("password.minimo")}</span>
          </label>

          <label className="campo">
            <span className="campo__etiqueta">{t("password.repetir")}</span>
            <input
              className="campo__control"
              type="password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              autoComplete="new-password"
              required
            />
            {noCoinciden && (
              <span className="campo__ayuda" style={{ color: "var(--error)" }}>
                {t("password.noCoinciden")}
              </span>
            )}
          </label>

          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="boton boton--principal boton--ancho"
            disabled={enviando || !valido || cortaDemas}
          >
            {t("password.guardar")}
          </button>

          <button type="button" className="boton boton--sutil" onClick={salir}>
            {t("comun.salir")}
          </button>
        </form>
      </div>
    </main>
  );
}
