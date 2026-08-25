import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { pedir } from "./api/cliente";
import type { JustificacionBandeja } from "./api/tipos";
import { PantallaLogin } from "./auth/PantallaLogin";
import { useSesion } from "./auth/sesion";
import { Marco } from "./componentes/Marco";
import { Dashboard } from "./paneles/Dashboard";
import { Acciones } from "./paneles/Acciones";
import {
  InformeCobertura,
  InformeEjecucion,
  InformeNoRealizacion,
} from "./paneles/Informes";
import { Catalogos } from "./paneles/Catalogos";
import { Checklists } from "./paneles/Checklists";
import { Justificaciones } from "./paneles/Justificaciones";
import { Rutas } from "./paneles/Rutas";
import { Tiendas } from "./paneles/Tiendas";
import { Usuarios } from "./paneles/Usuarios";

export function App() {
  const { perfil, cargando, idioma } = useSesion();
  const { t, i18n } = useTranslation();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (i18n.language !== idioma) void i18n.changeLanguage(idioma);
    document.documentElement.lang = idioma;
  }, [idioma, i18n]);

  /**
   * Contador de justificaciones pendientes para la navegación.
   *
   * Vive aquí y no en su panel porque el supervisor tiene que verlo esté en la
   * pantalla que esté: es lo único de la aplicación que exige una acción suya
   * con plazo.
   */
  useEffect(() => {
    if (!perfil) return;
    const contar = () =>
      pedir<JustificacionBandeja[]>("/justificaciones?soloPendientes=true")
        .then((filas) => setPendientes(filas.length))
        .catch(() => {
          /* Un fallo al contar no debe romper la navegación. */
        });

    void contar();
    const temporizador = setInterval(() => void contar(), 120_000);
    return () => clearInterval(temporizador);
  }, [perfil]);

  if (cargando) return <p className="cargando">{t("comun.cargando")}</p>;
  if (!perfil) return <PantallaLogin />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Marco pendientes={pendientes} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/acciones" element={<Acciones />} />
          <Route path="/justificaciones" element={<Justificaciones />} />
          <Route path="/informes/cobertura" element={<InformeCobertura />} />
          <Route path="/informes/no-realizacion" element={<InformeNoRealizacion />} />
          <Route path="/informes/ejecucion" element={<InformeEjecucion />} />
          <Route path="/rutas" element={<Rutas />} />
          <Route path="/tiendas" element={<Tiendas />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/catalogos" element={<Catalogos />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
