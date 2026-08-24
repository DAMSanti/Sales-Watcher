import { distanciaMetros } from "./jornada";

/**
 * Tolerancia base para el check-in.
 *
 * 250 metros es holgado a propósito. El GPS dentro de un centro comercial o un
 * sótano se va con facilidad, y el objetivo no es pillar a nadie sino dar al
 * supervisor una señal que mirar. Un umbral estrecho generaría tantos falsos
 * positivos que la señal dejaría de leerse (SPECS §11).
 */
export const RADIO_TOLERANCIA_M = 250;

/**
 * Por encima de esta incertidumbre la lectura no dice nada útil.
 *
 * Marcar como sospechosa una visita cuyo GPS reportó medio kilómetro de error
 * sería culpar al comercial del edificio en el que estaba trabajando.
 */
export const PRECISION_INUTILIZABLE_M = 200;

export type Coordenada = { lat: number; lon: number; precisionM: number };

export type Desviacion = {
  /** false cuando faltan datos o la precisión hace la comparación inútil. */
  evaluable: boolean;
  desviada: boolean;
  metros: number | null;
};

/**
 * Compara el check-in del comercial con la ubicación registrada de la tienda.
 *
 * El resultado NO bloquea la visita: genera una señal para el supervisor. Un
 * "no se pudo evaluar" honesto es más útil que un falso positivo.
 */
export function evaluarDesviacion(
  capturada: Coordenada | null | undefined,
  registrada: { lat: number; lon: number } | null | undefined,
): Desviacion {
  if (!capturada || !registrada) {
    return { evaluable: false, desviada: false, metros: null };
  }
  if (capturada.precisionM > PRECISION_INUTILIZABLE_M) {
    return { evaluable: false, desviada: false, metros: null };
  }

  const metros = distanciaMetros(capturada, registrada);

  /**
   * La incertidumbre del GPS se suma a la tolerancia: si el dispositivo dice
   * tener 80 m de error, 300 m medidos podrían ser 220 reales. Solo se marca
   * lo que excede el umbral incluso siendo generosos con el margen.
   */
  const umbral = RADIO_TOLERANCIA_M + capturada.precisionM;

  return { evaluable: true, desviada: metros > umbral, metros };
}
