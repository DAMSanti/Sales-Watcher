import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { instanteCierreJornada } from "@sw/shared";

/**
 * Aviso de cierre de jornada (SPECS §9).
 *
 * Avisa con una hora de antelación de las visitas que van a quedar sin
 * justificar. La antelación es lo importante: un recordatorio a las 20:55
 * empuja a justificar seis visitas de golpe eligiendo el primer motivo del
 * desplegable, que es exactamente el riesgo del catálogo convertido en
 * trámite (ANEXO §3). Con una hora por delante, al comercial le da tiempo a
 * ir a alguna tienda o a pensar el motivo real.
 *
 * Se recalcula cada minuto: la app puede llevar horas abierta en el bolsillo.
 */
const ANTELACION_MINUTOS = 60;

export function AvisoCierre({
  fecha,
  zonaHoraria,
  horaCierre,
  pendientes,
}: {
  fecha: string;
  zonaHoraria: string;
  horaCierre: string;
  /** Visitas planificadas que siguen sin hacer ni justificar. */
  pendientes: number;
}) {
  const { t } = useTranslation();
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(temporizador);
  }, []);

  if (pendientes === 0) return null;

  let cierre: Date;
  try {
    cierre = instanteCierreJornada(fecha, zonaHoraria, horaCierre);
  } catch {
    /** Configuración inválida: mejor no avisar que avisar a destiempo. */
    return null;
  }

  const minutosRestantes = Math.round((cierre.getTime() - ahora) / 60_000);

  /** Ya cerró: no se avisa de un plazo que pasó, el estado lo dirá solo. */
  if (minutosRestantes <= 0) return null;
  if (minutosRestantes > ANTELACION_MINUTOS) return null;

  return (
    <div className="dia__alerta dia__alerta--cierre" role="status">
      <strong>
        {t("cierre.titulo", { minutos: minutosRestantes })}
      </strong>
      <span>{t("cierre.explicacion", { count: pendientes })}</span>
    </div>
  );
}
