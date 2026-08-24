import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./dialogo.css";

/**
 * Diálogo modal para altas y ediciones.
 *
 * Se usa en lugar de una página aparte porque el administrador trabaja sobre
 * una lista: al guardar tiene que volver a ver la tabla con el cambio ya
 * aplicado, y una navegación completa le haría perder el desplazamiento y los
 * filtros que tenía puestos.
 */
export function Dialogo({
  titulo,
  children,
  onCerrar,
  acciones,
  ancho = "480px",
}: {
  titulo: string;
  children: ReactNode;
  onCerrar: () => void;
  acciones?: ReactNode;
  ancho?: string;
}) {
  const { t } = useTranslation();

  /** Escape cierra: el diálogo tapa la pantalla y hay que poder salir sin ratón. */
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  return (
    <div className="dialogo" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="dialogo__fondo" onClick={onCerrar} />
      <div className="dialogo__panel" style={{ maxWidth: ancho }}>
        <header className="dialogo__cabecera">
          <h2 className="dialogo__titulo">{titulo}</h2>
          <button
            className="dialogo__cerrar"
            onClick={onCerrar}
            aria-label={t("comun.cancelar")}
          >
            ×
          </button>
        </header>

        <div className="dialogo__cuerpo">{children}</div>

        {acciones && <footer className="dialogo__pie">{acciones}</footer>}
      </div>
    </div>
  );
}
