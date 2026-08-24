import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PantallaCambioPassword } from "./auth/PantallaCambioPassword";
import { PantallaLogin } from "./auth/PantallaLogin";
import { useSesion } from "./auth/sesion";
import { VistaDelDia } from "./visitas/VistaDelDia";

export function App() {
  const { perfil, cargando, idioma } = useSesion();
  const { t, i18n } = useTranslation();

  /** El idioma de la interfaz sigue a la preferencia guardada del usuario. */
  useEffect(() => {
    if (i18n.language !== idioma) void i18n.changeLanguage(idioma);
    document.documentElement.lang = idioma;
  }, [idioma, i18n]);

  if (cargando) return <p className="cargando">{t("comun.cargando")}</p>;
  if (!perfil) return <PantallaLogin />;

  /**
   * El veto de contraseña pendiente se replica aquí porque la API bloquea el
   * resto de endpoints en ese estado: sin esto, la vista del día se pintaría
   * y fallaría en su primera petición.
   */
  if (perfil.requiereCambioPassword) return <PantallaCambioPassword />;

  return <VistaDelDia />;
}
