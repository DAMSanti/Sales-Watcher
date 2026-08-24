import { ErrorApi, pedir } from "../api/cliente";
import {
  anotarFalloFoto,
  eliminarFotoPendiente,
  fotosPendientes,
  guardarFotoPendiente,
  type FotoPendiente,
} from "../offline/almacen";
import type { Punto } from "../comun/ubicacion";
import type { FotoComprimida } from "./comprimir";

type Reserva = { fotoId: string; urlSubida: string | null; yaConfirmada: boolean };

export type Destino = {
  visitaId: string;
  ambito: "visita" | "checklist" | "incidencia";
  resultadoChecklistId?: string;
  incidenciaId?: string;
};

export type ResultadoSubida =
  | { via: "subida"; fotoId: string }
  | { via: "guardada"; fotoLocalId: string };

/**
 * Sube una fotografía, o la guarda para cuando haya cobertura.
 *
 * La subida son tres pasos y el primero ya necesita red: reservar para obtener
 * la URL firmada, subir el fichero al almacenamiento y confirmar. Sin señal no
 * se puede empezar, así que el binario se guarda en IndexedDB y el flujo
 * entero se reintenta después.
 */
export async function subirFoto(
  foto: FotoComprimida,
  destino: Destino,
  ubicacion?: Punto,
): Promise<ResultadoSubida> {
  const capturadaEn = new Date().toISOString();

  if (navigator.onLine) {
    try {
      const fotoId = await flujoCompleto(foto.blob, {
        ...destino,
        tipoMime: foto.tipoMime,
        tamanoBytes: foto.tamanoBytes,
        anchoPx: foto.ancho,
        altoPx: foto.alto,
        capturadaEn,
        ubicacion,
      });
      return { via: "subida", fotoId };
    } catch (error) {
      /**
       * Solo se guarda para después si falló la RED. Un rechazo del servidor
       * —tipo no admitido, visita cerrada— volvería a fallar igual y guardarlo
       * dejaría un binario ocupando espacio para siempre.
       */
      if (!(error instanceof ErrorApi) || !error.esFalloDeRed) throw error;
    }
  }

  const fotoLocalId = crypto.randomUUID();
  await guardarFotoPendiente({
    fotoLocalId,
    ...destino,
    blob: foto.blob,
    tipoMime: foto.tipoMime,
    tamanoBytes: foto.tamanoBytes,
    anchoPx: foto.ancho,
    altoPx: foto.alto,
    capturadaEn,
    ubicacion,
    intentos: 0,
  });

  return { via: "guardada", fotoLocalId };
}

/** Los tres pasos seguidos. Usado tanto en directo como al sincronizar. */
async function flujoCompleto(
  blob: Blob,
  datos: {
    visitaId: string;
    ambito: "visita" | "checklist" | "incidencia";
    resultadoChecklistId?: string;
    incidenciaId?: string;
    tipoMime: string;
    tamanoBytes: number;
    anchoPx?: number;
    altoPx?: number;
    capturadaEn: string;
    ubicacion?: Punto;
  },
): Promise<string> {
  const reserva = await pedir<Reserva>("/fotos/subida", {
    metodo: "POST",
    cuerpo: datos,
  });

  /** Reserva ya confirmada: llegó en un intento anterior cuya respuesta se
   *  perdió. No hay nada que subir. */
  if (reserva.yaConfirmada || !reserva.urlSubida) return reserva.fotoId;

  const respuesta = await fetch(reserva.urlSubida, {
    method: "PUT",
    headers: { "Content-Type": datos.tipoMime },
    body: blob,
  }).catch(() => {
    throw new ErrorApi(0, "Sin conexión al subir la imagen");
  });

  if (!respuesta.ok) {
    throw new ErrorApi(respuesta.status, "El almacenamiento rechazó la imagen");
  }

  /**
   * La confirmación no es un trámite: el servidor comprueba contra el
   * almacenamiento que el objeto existe y que su tamaño y tipo coinciden. Sin
   * ella, un ítem que exige foto quedaría satisfecho por una subida a medias.
   */
  await pedir(`/fotos/${reserva.fotoId}/confirmar`, { metodo: "POST" });

  return reserva.fotoId;
}

/**
 * Sube las fotos que quedaron guardadas sin cobertura.
 *
 * Se ejecuta junto a la sincronización de la cola. Va de una en una: son
 * cientos de kilobytes cada una y lanzarlas en paralelo sobre una red móvil
 * mediocre haría que ninguna terminase.
 */
export async function subirPendientes(): Promise<{ subidas: number; fallos: number }> {
  if (!navigator.onLine) return { subidas: 0, fallos: 0 };

  const pendientes = await fotosPendientes();
  let subidas = 0;
  let fallos = 0;

  for (const foto of pendientes) {
    try {
      await flujoCompleto(foto.blob, foto as FotoPendiente & { visitaId: string });
      await eliminarFotoPendiente(foto.fotoLocalId);
      subidas++;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);

      /**
       * Un rechazo definitivo del servidor no se reintenta indefinidamente: se
       * anota y, superados unos intentos, se descarta. Un binario que nunca va
       * a entrar ocuparía el almacenamiento del móvil sin límite.
       */
      if (error instanceof ErrorApi && !error.esFalloDeRed && foto.intentos >= 2) {
        await eliminarFotoPendiente(foto.fotoLocalId);
      } else {
        await anotarFalloFoto(foto.fotoLocalId, mensaje);
      }
      fallos++;
    }
  }

  return { subidas, fallos };
}
