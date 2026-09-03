import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PantallaLogin } from "./auth/PantallaLogin";
import { useSesion } from "./auth/sesion";
import { Marco } from "./componentes/Marco";
import { Actividad } from "./paneles/Actividad";
import { Acciones } from "./paneles/Acciones";
import { Resultados } from "./paneles/Resultados";
import { DetalleVisita } from "./paneles/DetalleVisita";
import { Productos } from "./paneles/Productos";
import { RelacionResponsable } from "./paneles/RelacionResponsable";
import {
  InformeCobertura,
  InformeEjecucion,
  InformeNoRealizacion,
} from "./paneles/Informes";
import { Catalogos } from "./paneles/Catalogos";
import { Checklists } from "./paneles/Checklists";
import { ConsultaTiendas } from "./paneles/ConsultaTiendas";
import { FichaTienda } from "./paneles/FichaTienda";
import { Justificaciones } from "./paneles/Justificaciones";
import { Rutas } from "./paneles/Rutas";
import { Tiendas } from "./paneles/Tiendas";
import { Usuarios } from "./paneles/Usuarios";

export function App() {
  const { perfil, cargando, idioma } = useSesion();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== idioma) void i18n.changeLanguage(idioma);
    document.documentElement.lang = idioma;
  }, [idioma, i18n]);

  if (cargando) return <p className="cargando">{t("comun.cargando")}</p>;
  if (!perfil) return <PantallaLogin />;

  /*
   * La base la decide Vite (`base` en vite.config.ts) y el router la lee de
   * ahí en vez de repetirla: dos sitios con la misma ruta escrita a mano se
   * desincronizan, y el síntoma sería una pantalla en blanco sin error.
   */
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Marco />}>
          <Route path="/" element={<Actividad />} />
          <Route path="/acciones" element={<Acciones />} />
          <Route path="/resultados" element={<Resultados />} />
          <Route path="/visitas/:id" element={<DetalleVisita />} />
          <Route path="/consulta-tiendas" element={<ConsultaTiendas />} />
          <Route path="/consulta-tiendas/:id" element={<FichaTienda />} />
          <Route path="/tiendas/:id/relacion" element={<RelacionResponsable />} />
          <Route path="/productos" element={<Productos />} />
          {/*
            Justificaciones y Rutas ya no son pantallas centrales del FSM
            (documento FSM v2.0, 2026-09-03 — ver ANEXO ronda 7): se retiran
            de la navegación principal, pero la ruta se conserva por si hace
            falta acceder directamente mientras se decide su destino final.
          */}
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
