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
          <div className="lateral__grupo">{t("nav.supervision")}</div>
          <NavLink to="/" end className={clase}>
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/acciones" className={clase}>
            {t("nav.acciones")}
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

          <div className="lateral__grupo">{t("nav.gestion")}</div>
          {/*
            Las rutas las planifica también el supervisor: es quien conoce el
            terreno de su zona. El resto del maestro es solo de administrador.
          */}
          <NavLink to="/rutas" className={clase}>
            {t("nav.rutas")}
          </NavLink>
          {esAdministrador && (
            <>
              <NavLink to="/tiendas" className={clase}>
                {t("nav.tiendas")}
              </NavLink>
              <NavLink to="/usuarios" className={clase}>
                {t("nav.usuarios")}
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
