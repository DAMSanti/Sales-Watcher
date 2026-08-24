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
export function Marco({ pendientes }: { pendientes: number }) {
  const { t } = useTranslation();
  const { perfil, salir } = useSesion();

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
          <div className="lateral__grupo">{t("nav.supervision")}</div>
          <NavLink to="/" end className={clase}>
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/incidencias" className={clase}>
            {t("nav.incidencias")}
          </NavLink>
          <NavLink to="/justificaciones" className={clase}>
            <span>{t("nav.justificaciones")}</span>
            {/* Contador solo si hay algo: un cero permanente deja de leerse. */}
            {pendientes > 0 && <span className="lateral__cuenta">{pendientes}</span>}
          </NavLink>

          <div className="lateral__grupo">{t("nav.informes")}</div>
          <NavLink to="/informes/cobertura" className={clase}>
            {t("nav.cobertura")}
          </NavLink>
          <NavLink to="/informes/no-realizacion" className={clase}>
            {t("nav.noRealizacion")}
          </NavLink>
          <NavLink to="/informes/ejecucion" className={clase}>
            {t("nav.ejecucion")}
          </NavLink>
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
