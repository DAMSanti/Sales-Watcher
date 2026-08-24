import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PantallaCambioPassword } from "./auth/PantallaCambioPassword";
import { PantallaLogin } from "./auth/PantallaLogin";
import { useSesion } from "./auth/sesion";
import { BuscadorTiendas } from "./visitas/BuscadorTiendas";
import { DetalleVisita } from "./visitas/DetalleVisita";
import { VistaDelDia } from "./visitas/VistaDelDia";

export function App() {
  const { perfil, cargando, idioma } = useSesion();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== idioma) void i18n.changeLanguage(idioma);
    document.documentElement.lang = idioma;
  }, [idioma, i18n]);

  if (cargando) return <p className="cargando">{t("comun.cargando")}</p>;
  if (!perfil) return <PantallaLogin />;

  /**
   * El veto de contraseña pendiente se replica aquí porque la API bloquea el
   * resto de endpoints en ese estado: sin esto, cualquier pantalla se pintaría
   * y fallaría en su primera petición.
   */
  if (perfil.requiereCambioPassword) return <PantallaCambioPassword />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VistaDelDia />} />
        <Route path="/visita/:id" element={<DetalleVisita />} />
        <Route path="/anadir" element={<BuscadorTiendas />} />
        {/* Cualquier ruta desconocida devuelve a la vista del día. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
