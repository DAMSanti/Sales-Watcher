import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import type { Motivo } from "../api/tipos";
import { useSesion } from "../auth/sesion";

/**
 * Justificación de una visita no realizada (SPECS §5.5).
 *
 * La ventana es diaria y el servidor la valida contra la hora de captura en
 * el dispositivo, no contra la de llegada: por eso `capturadaEn` se toma aquí,
 * en el momento en que el comercial pulsa, y viaja con la operación. Si la
 * sincronización tarda dos horas por falta de cobertura, la justificación
 * sigue siendo válida.
 */
export function DialogoJustificar({
  visitaId,
  alCerrar,
  alJustificar,
}: {
  visitaId: string;
  alCerrar: () => void;
  alJustificar: () => void;
}) {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pedir<Motivo[]>("/visitas/motivos", { idioma })
      .then(setMotivos)
      .catch(() => setError(t("comun.sinConexion")));
  }, [idioma, t]);

  /** Cerrar con Escape: el diálogo tapa la pantalla entera. */
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [alCerrar]);

  const motivo = motivos.find((m) => m.id === motivoId);
  const faltaComentario = motivo?.requiereComentario && !comentario.trim();

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      await pedir(`/visitas/${visitaId}/justificar`, {
        metodo: "POST",
        cuerpo: {
          motivoId,
          comentario: comentario.trim() || undefined,
          // Hora del DISPOSITIVO: es la que valida la ventana diaria.
          capturadaEn: new Date().toISOString(),
        },
      });
      alJustificar();
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={t("justificar.titulo")}
    >
      <div className="modal__fondo" onClick={alCerrar} />
      <div className="modal__panel">
        <h2 className="modal__titulo">{t("justificar.titulo")}</h2>
        <p className="modal__explicacion">{t("justificar.explicacion")}</p>

        {error && (
          <div className="aviso aviso--error" role="alert">
            {error}
          </div>
        )}

        <div className="campo">
          <span className="campo__etiqueta">{t("justificar.motivo")}</span>
          <div className="motivos">
            {motivos.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`motivo ${motivoId === m.id ? "motivo--activo" : ""}`}
                onClick={() => setMotivoId(m.id)}
                aria-pressed={motivoId === m.id}
              >
                {m.texto}
              </button>
            ))}
          </div>
        </div>

        {motivo && (
          <label className="campo">
            <span className="campo__etiqueta">
              {t("justificar.comentario")}
              {motivo.requiereComentario && " *"}
            </span>
            <textarea
              className="campo__control"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              maxLength={2000}
            />
            {faltaComentario && (
              <span className="campo__ayuda" style={{ color: "var(--error)" }}>
                {t("justificar.comentarioObligatorio")}
              </span>
            )}
          </label>
        )}

        <div className="modal__acciones">
          <button className="boton boton--sutil" onClick={alCerrar} disabled={enviando}>
            {t("comun.cancelar")}
          </button>
          <button
            className="boton boton--aviso"
            onClick={() => void confirmar()}
            disabled={enviando || !motivoId || faltaComentario}
          >
            {enviando ? t("justificar.confirmando") : t("justificar.confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
