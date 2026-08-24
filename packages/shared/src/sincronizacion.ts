/**
 * Contrato de la cola de sincronización offline.
 *
 * Vive en `@sw/shared` porque la PWA y la API tienen que estar de acuerdo en
 * qué significa cada resultado. Si el cliente y el servidor discrepasen sobre
 * qué es reintentable, la cola se atascaría para siempre o descartaría datos
 * que sí habrían entrado.
 */

/**
 * Referencia a una visita que puede no existir todavía en el servidor.
 *
 * Cuando el comercial crea una visita extra sin cobertura, el identificador de
 * servidor no existe: solo el `idCliente` que generó el dispositivo. Las
 * operaciones siguientes del mismo lote —comenzar, marcar checklist,
 * finalizar— tienen que poder apuntar a ella igualmente, así que se admiten
 * las dos formas y el servidor resuelve el `idCliente` sobre la marcha.
 */
export type RefVisita = { id?: string; idCliente?: string };

export type TipoOperacion =
  | "visita.crear"
  | "visita.comenzar"
  | "visita.finalizar"
  | "visita.justificar"
  | "checklist.marcar"
  | "incidencia.crear"
  | "foto.reservar"
  | "foto.confirmar";

/**
 * Resultado de cada operación del lote.
 *
 * La distinción entre permanente y temporal es lo más importante de todo el
 * contrato:
 *
 * - `aplicada` / `duplicada`: el cliente la borra de la cola. `duplicada`
 *   significa que ya había llegado en un envío anterior cuya respuesta se
 *   perdió — resultado correcto, no error.
 * - `fallida_permanente`: reintentarla daría el mismo error siempre (ventana
 *   cerrada, visita ya finalizada, categoría dada de baja). El cliente la
 *   saca de la cola y se lo enseña al comercial. Reintentar sería atascar la
 *   cola con algo que nunca va a entrar.
 * - `fallida_temporal`: el servidor falló por algo circunstancial. El cliente
 *   la conserva y reintenta. Descartarla perdería trabajo real de campo.
 */
export type EstadoOperacion =
  | "aplicada"
  | "duplicada"
  | "fallida_permanente"
  | "fallida_temporal";

export type ResultadoOperacion = {
  /** Índice en el lote enviado, para que el cliente case respuesta con envío. */
  indice: number;
  tipo: TipoOperacion;
  estado: EstadoOperacion;
  /** Identificador de servidor de lo creado o modificado. */
  id?: string;
  /** Eco del `idCliente`, para que el cliente resuelva sus referencias. */
  idCliente?: string;
  /** Mensaje legible; solo presente cuando falla. */
  error?: string;
  /** Carga adicional, como la URL firmada de una reserva de foto. */
  datos?: Record<string, unknown>;
};

export type RespuestaLote = {
  aplicadas: number;
  duplicadas: number;
  fallidasPermanentes: number;
  fallidasTemporales: number;
  resultados: ResultadoOperacion[];
};

/**
 * Códigos HTTP que el cliente NO debe reintentar.
 *
 * Todo lo que sea culpa de los datos enviados o del estado del dominio es
 * permanente: reintentar produciría exactamente el mismo error. Lo que no
 * esté en esta lista se trata como temporal, que es el sesgo seguro —
 * reintentar de más solo cuesta una petición; descartar de menos pierde el
 * trabajo de una visita.
 */
export const CODIGOS_PERMANENTES = [400, 401, 403, 404, 409, 422] as const;

export function esFalloPermanente(codigo: number): boolean {
  return (CODIGOS_PERMANENTES as readonly number[]).includes(codigo);
}

/** Tope de operaciones por lote. */
export const MAX_OPERACIONES_LOTE = 200;
