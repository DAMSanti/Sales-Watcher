import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { useSesion } from "../auth/sesion";
import "../estilos/layout.css";

/**
 * Marco de la aplicación: navegación lateral fija más área de contenido.
 *
 * La navegación distingue supervisión de informes porque son dos usos
 * distintos: lo primero se mira varias veces al día y exige acción, lo segundo
 * se consulta al cerrar la semana.
 */
export function Marco() {
  const { t } = useTranslation();
  const { perfil, salir } = useSesion();

  const esAdministrador = perfil?.rol === "administrador";

  const clase = ({ isActive }: { isActive: boolean }) =>
    `lateral__enlace ${isActive ? "lateral__enlace--activo" : ""}`;

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="lateral__marca">
          <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
            <rect width="40" height="40" rx="9" fill="var(--azul-600)" />
            <path
              d="M12 21.5l5.2 5.2L28.5 15.4"
              fill="none"
              stroke="white"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <div className="lateral__nombre">Sales Watcher</div>
            <div className="lateral__rol">
              {perfil?.numeroTrabajador} · {perfil?.rol}
            </div>
          </div>
        </div>

        <nav className="lateral__nav">
          {/*
            Cuatro secciones (documento FSM v2.0, 2026-09-03 — ANEXO ronda 7):
            Actividad · Acciones · Tiendas · Resultados. Rutas y
            Justificaciones dejan de estar aquí: ya no son pantallas
            centrales del producto FSM, aunque sus rutas se conservan.
          */}
          <div className="lateral__grupo">{t("nav.supervision")}</div>
          <NavLink to="/" end className={clase}>
            {t("nav.actividad")}
          </NavLink>
          <NavLink to="/acciones" className={clase}>
            {t("nav.acciones")}
          </NavLink>
          <NavLink to="/consulta-tiendas" className={clase}>
            {t("nav.consultaTiendas")}
          </NavLink>

          <div className="lateral__grupo">{t("nav.informes")}</div>
          <NavLink to="/resultados" className={clase}>
            {t("nav.resultados")}
          </NavLink>
          <NavLink to="/informes/cobertura" className={clase}>
            {t("nav.cobertura")}
          </NavLink>
          <NavLink to="/informes/no-realizacion" className={clase}>
            {t("nav.noRealizacion")}
          </NavLink>
          <NavLink to="/informes/ejecucion" className={clase}>
            {t("nav.ejecucion")}
          </NavLink>

          {esAdministrador && (
            <>
              <div className="lateral__grupo">{t("nav.gestion")}</div>
              <NavLink to="/tiendas" className={clase}>
                {t("nav.tiendas")}
              </NavLink>
              <NavLink to="/usuarios" className={clase}>
                {t("nav.usuarios")}
              </NavLink>
              <NavLink to="/productos" className={clase}>
            {t("nav.productos")}
          </NavLink>
          <NavLink to="/catalogos" className={clase}>
                {t("nav.catalogos")}
              </NavLink>
              <NavLink to="/checklists" className={clase}>
                {t("nav.checklists")}
              </NavLink>
            </>
          )}
        </nav>

        <div className="lateral__pie">
          <button className="boton boton--sutil boton--ancho" onClick={salir}>
            {t("comun.salir")}
          </button>
        </div>
      </aside>

      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
