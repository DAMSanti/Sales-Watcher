export type Punto = {
  lat: number;
  lon: number;
  precisionM: number;
  capturadoEn: string;
};

/**
 * Lee la ubicación del dispositivo.
 *
 * NUNCA lanza: devuelve `undefined` si el permiso está denegado, el GPS no
 * fija posición o se agota el tiempo. Es deliberado — el check-in no puede
 * depender de que la geolocalización funcione. Un comercial con el GPS
 * apagado o dentro de un sótano tiene que poder registrar su visita igual, y
 * el servidor ya trata la ubicación ausente como "no evaluable" en lugar de
 * como sospechosa.
 */
export async function obtenerUbicacion(): Promise<Punto | undefined> {
  if (!("geolocation" in navigator)) return undefined;

  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        resolver({
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
          /**
           * La incertidumbre viaja con la lectura. Sin ella el servidor no
           * puede distinguir una desviación real de un GPS perdido dentro de
           * un centro comercial.
           */
          precisionM: posicion.coords.accuracy ?? 0,
          capturadoEn: new Date(posicion.timestamp).toISOString(),
        }),
      () => resolver(undefined),
      {
        enableHighAccuracy: true,
        /**
         * Ocho segundos. Más tiempo deja al comercial mirando un botón que no
         * responde; menos, descarta lecturas que habrían llegado. Si expira,
         * la visita se registra sin ubicación.
         */
        timeout: 8000,
        /** Se acepta una lectura de hasta un minuto: la tienda no se mueve. */
        maximumAge: 60_000,
      },
    );
  });
}
