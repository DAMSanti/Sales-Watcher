import { MAX_OPERACIONES_LOTE, type RespuestaLote, type TipoOperacion } from "@sw/shared";
import { ErrorApi, pedir } from "../api/cliente";
import { subirPendientes } from "../fotos/subida";
import {
  anotarIntento,
  eliminar,
  encolar,
  marcarFallida,
  pendientes,
  type OperacionEncolada,
} from "./almacen";

/**
 * Cola de sincronización.
 *
 * ESTRATEGIA: se intenta el envío directo primero y solo se encola si falla
 * por red. La alternativa —encolar siempre— daría un único camino de código,
 * más limpio, pero obligaría a proyectar el estado localmente para que la
 * pantalla reaccionase al instante, y eso es bastante más superficie de error.
 * Con esta, el camino con cobertura es el que ya estaba probado y el camino
 * sin cobertura es el añadido.
 *
 * La contrapartida a vigilar: son dos caminos y pueden divergir. Por eso el
 * cuerpo que se manda directo y el que se encola se construyen en el MISMO
 * sitio, en `ejecutar`.
 */

export type Resultado<T> =
  | { via: "directo"; datos: T }
  | { via: "encolado"; operacion: OperacionEncolada };

let sincronizando = false;
const oyentes = new Set<() => void>();

export function alCambiarLaCola(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function avisar() {
  for (const oyente of oyentes) oyente();
}

function nuevoId() {
  return crypto.randomUUID();
}

/**
 * Ejecuta una operación: directa si hay red, encolada si no.
 *
 * @param ruta      Endpoint directo, para el camino con cobertura.
 * @param tipo      Tipo de operación del contrato de sincronización.
 * @param carga     Cuerpo para el endpoint de lote.
 * @param cuerpo    Cuerpo para el endpoint directo. Suele ser un subconjunto
 *                  de `carga`, porque el lote necesita además la referencia a
 *                  la visita, que en el directo va en la URL.
 */
export async function ejecutar<T>(opciones: {
  ruta: string;
  metodo?: "POST";
  tipo: TipoOperacion;
  carga: Record<string, unknown>;
  cuerpo: Record<string, unknown>;
  descripcion?: string;
}): Promise<Resultado<T>> {
  const opId = nuevoId();

  try {
    const datos = await pedir<T>(opciones.ruta, {
      metodo: opciones.metodo ?? "POST",
      cuerpo: opciones.cuerpo,
    });
    return { via: "directo", datos };
  } catch (error) {
    /**
     * Solo se encola ante un fallo de RED. Un 409 por ventana cerrada o un
     * 403 por visita ajena se propagan tal cual: encolarlos metería en la cola
     * algo que va a fallar igual en cada reintento, que es exactamente lo que
     * el contrato llama fallo permanente.
     */
    if (!(error instanceof ErrorApi) || !error.esFalloDeRed) throw error;

    const operacion = await encolar({
      opId,
      tipo: opciones.tipo,
      carga: { ...opciones.carga, tipo: opciones.tipo, opId },
      descripcion: opciones.descripcion,
    });

    avisar();
    return { via: "encolado", operacion };
  }
}

/**
 * Envía lo pendiente al endpoint de lote.
 *
 * Devuelve cuántas se aplicaron y cuántas quedaron. No lanza: un fallo al
 * sincronizar no debe romper la pantalla desde la que se disparó.
 */
export async function sincronizar(): Promise<{
  enviadas: number;
  aplicadas: number;
  fallidas: number;
  pendientes: number;
}> {
  if (sincronizando) return { enviadas: 0, aplicadas: 0, fallidas: 0, pendientes: 0 };
  sincronizando = true;

  try {
    const cola = await pendientes();
    if (cola.length === 0) {
      return { enviadas: 0, aplicadas: 0, fallidas: 0, pendientes: 0 };
    }

    /** El tope del lote lo fija el contrato compartido, no un número suelto. */
    const lote = cola.slice(0, MAX_OPERACIONES_LOTE);

    let respuesta: RespuestaLote;
    try {
      respuesta = await pedir<RespuestaLote>("/sincronizacion/lote", {
        metodo: "POST",
        cuerpo: { operaciones: lote.map((o) => o.carga) },
      });
    } catch (error) {
      /**
       * Si el lote entero falla por red, no se toca nada: sigue pendiente y se
       * reintentará. Anotar el intento sirve para que la pantalla de cola
       * pueda mostrar por qué lleva rato sin salir.
       */
      const mensaje = error instanceof Error ? error.message : String(error);
      for (const operacion of lote) await anotarIntento(operacion.opId, mensaje);
      avisar();
      return {
        enviadas: lote.length,
        aplicadas: 0,
        fallidas: 0,
        pendientes: cola.length,
      };
    }

    let aplicadas = 0;
    let fallidas = 0;

    for (const resultado of respuesta.resultados) {
      const operacion = lote[resultado.indice];
      if (!operacion) continue;

      switch (resultado.estado) {
        case "aplicada":
        case "duplicada":
          /** `duplicada` no es un error: ya había llegado en un envío cuya
           *  respuesta se perdió. Se descarta igual que una aplicada. */
          await eliminar(operacion.opId);
          aplicadas++;
          break;

        case "fallida_permanente":
          /** Se conserva marcada para que el comercial vea qué pasó y por qué.
           *  Borrarla en silencio haría desaparecer trabajo real sin avisar. */
          await marcarFallida(
            operacion.opId,
            resultado.error ?? "El servidor rechazó la operación",
          );
          fallidas++;
          break;

        case "fallida_temporal":
          await anotarIntento(
            operacion.opId,
            resultado.error ?? "Error temporal del servidor",
          );
          break;
      }
    }

    avisar();
    const restantes = await pendientes();

    return {
      enviadas: lote.length,
      aplicadas,
      fallidas,
      pendientes: restantes.length,
    };
  } finally {
    sincronizando = false;
  }
}

/**
 * Arranca la sincronización automática.
 *
 * Tres disparadores, y los tres hacen falta:
 *  - `online`: el caso obvio, al recuperar cobertura.
 *  - Al volver a primer plano: en móvil el evento `online` no siempre llega si
 *    la pestaña estaba dormida.
 *  - Periódico: la cobertura puede volver sin que el navegador lo anuncie, que
 *    es habitual en redes móviles con señal intermitente.
 */
export function iniciarSincronizacionAutomatica(intervaloMs = 30_000) {
  const intentar = () => {
    if (!navigator.onLine) return;
    void sincronizar();
    /**
     * Las fotos van por su cuenta y DESPUÉS de las operaciones.
     *
     * Una foto de ítem de checklist necesita que su fila de resultado exista
     * en el servidor; si se subiera antes de sincronizar la cola, el destino
     * al que se asocia podría no haberse creado todavía.
     */
    void subirPendientes();
  };

  const alVolverAlFrente = () => {
    if (document.visibilityState === "visible") intentar();
  };

  window.addEventListener("online", intentar);
  document.addEventListener("visibilitychange", alVolverAlFrente);
  const temporizador = setInterval(intentar, intervaloMs);

  intentar();

  return () => {
    window.removeEventListener("online", intentar);
    document.removeEventListener("visibilitychange", alVolverAlFrente);
    clearInterval(temporizador);
  };
}
