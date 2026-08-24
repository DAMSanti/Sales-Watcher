/**
 * Reglas de jornada laboral y ventana de justificación.
 *
 * Este módulo concentra la lógica más delicada del dominio, y vive en el
 * paquete compartido a propósito: la PWA necesita saber si la ventana sigue
 * abierta para mostrar o esconder el botón de justificar, y la API necesita la
 * misma regla para validar. Duplicarla en los dos lados garantizaría que se
 * desincronizasen.
 */

/**
 * Determina si una justificación llega dentro de la ventana permitida.
 *
 * La justificación se hace el mismo día, antes de terminar la jornada
 * (ANEXO, decisión que cierra P12).
 *
 * ⚠️ `capturadaEn` debe ser la marca de tiempo del DISPOSITIVO, nunca la hora
 * de llegada al servidor. El comercial puede justificar a las 19:55 sin
 * cobertura y que la cola no sincronice hasta las 21:30; validar contra la
 * hora de recepción rechazaría esa justificación y castigaría al comercial por
 * el fallo de red que el modo offline existe para absorber.
 *
 * @param capturadaEn  Momento en que el comercial pulsó "justificar" (UTC).
 * @param fechaVisita  Fecha local de la visita, formato `YYYY-MM-DD`.
 * @param zonaHoraria  Zona IANA del comercial, p. ej. `Europe/Madrid`.
 * @param horaCierre   Hora local de cierre de jornada, formato `HH:mm`.
 */
export function ventanaJustificacionAbierta(
  capturadaEn: Date,
  fechaVisita: string,
  zonaHoraria: string,
  horaCierre: string,
): boolean {
  const limite = instanteCierreJornada(fechaVisita, zonaHoraria, horaCierre);
  return capturadaEn.getTime() <= limite.getTime();
}

/**
 * Instante UTC en que cierra la jornada de una fecha local dada.
 *
 * Resuelve la hora local en la zona del comercial y la convierte a UTC, con lo
 * que el horario de verano queda contemplado sin tratarlo como caso especial.
 */
export function instanteCierreJornada(
  fechaVisita: string,
  zonaHoraria: string,
  horaCierre: string,
): Date {
  const [horas, minutos] = horaCierre.split(":").map(Number);
  if (horas === undefined || minutos === undefined || Number.isNaN(horas)) {
    throw new Error(`Hora de cierre inválida: "${horaCierre}". Se espera "HH:mm".`);
  }

  const [anio, mes, dia] = fechaVisita.split("-").map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) {
    throw new Error(`Fecha inválida: "${fechaVisita}". Se espera "YYYY-MM-DD".`);
  }

  // Punto de partida: interpretamos la hora local como si fuera UTC y luego
  // corregimos por el desfase real de la zona en esa fecha concreta.
  const tentativa = Date.UTC(anio, mes - 1, dia, horas, minutos, 0, 0);
  const desfase = desfaseZonaMs(new Date(tentativa), zonaHoraria);
  return new Date(tentativa - desfase);
}

/**
 * Desfase en milisegundos entre una zona horaria y UTC en un instante dado.
 * Se calcula con `Intl` para no arrastrar una dependencia de zonas horarias.
 */
function desfaseZonaMs(instante: Date, zonaHoraria: string): number {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: zonaHoraria,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const partes = Object.fromEntries(
    formateador.formatToParts(instante).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    // Intl devuelve "24" para medianoche en algunos entornos.
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );

  return comoUtc - instante.getTime();
}

/**
 * Fecha local (`YYYY-MM-DD`) de un instante en una zona dada.
 *
 * Es la función que decide a qué jornada pertenece una visita. Usar la fecha
 * UTC en su lugar desplazaría de día todo lo ocurrido a última hora de la
 * tarde en horario de verano.
 */
export function fechaLocal(instante: Date, zonaHoraria: string): string {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formateador.format(instante);
}

/**
 * Distancia en metros entre dos puntos (fórmula de Haversine).
 *
 * Se usa para comparar el check-in del comercial con la ubicación registrada
 * de la tienda. El resultado NO bloquea la visita: genera una señal de alerta
 * para el supervisor, porque el GPS falla dentro de edificios con demasiada
 * frecuencia como para convertir la desviación en un muro (SPECS §11).
 */
export function distanciaMetros(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const RADIO_TIERRA_M = 6_371_000;
  const rad = (grados: number) => (grados * Math.PI) / 180;

  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h)));
}
