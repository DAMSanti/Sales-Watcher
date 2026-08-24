import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { TipoOperacion } from "@sw/shared";

/**
 * Almacén local de la app de campo.
 *
 * Dos usos distintos en la misma base:
 *
 *  - `cola`: operaciones pendientes de enviar. Es lo que garantiza que el
 *    trabajo del comercial no se pierde cuando no hay cobertura.
 *  - `cache`: última respuesta conocida de las pantallas de lectura, para que
 *    la app siga mostrando la ruta del día en un sótano.
 *
 * Se usa IndexedDB y no `localStorage` porque la cola puede acumular la
 * jornada entera y `localStorage` es síncrono: bloquearía el hilo de interfaz
 * justo cuando el comercial está tocando la pantalla.
 */

export type EstadoOperacion = "pendiente" | "fallida";

export type OperacionEncolada = {
  /** Identificador de la ENTRADA DE COLA. Es el `opId` del contrato de la API. */
  opId: string;
  tipo: TipoOperacion;
  /** Cuerpo de la operación, ya con la forma que espera el endpoint de lote. */
  carga: Record<string, unknown>;
  creadaEn: number;
  intentos: number;
  estado: EstadoOperacion;
  /** Mensaje del último fallo, para poder enseñárselo al comercial. */
  error?: string;
  /** Descripción legible de qué se estaba haciendo, para la pantalla de cola. */
  descripcion?: string;
};

type EsquemaSw = DBSchema & {
  cola: {
    key: string;
    value: OperacionEncolada;
    indexes: { "por-creacion": number };
  };
  cache: {
    key: string;
    value: { clave: string; datos: unknown; guardadoEn: number };
  };
};

const NOMBRE_BD = "sales-watcher";
const VERSION = 1;

let promesaBd: Promise<IDBPDatabase<EsquemaSw>> | null = null;

function bd() {
  promesaBd ??= openDB<EsquemaSw>(NOMBRE_BD, VERSION, {
    upgrade(base) {
      const cola = base.createObjectStore("cola", { keyPath: "opId" });
      /** El orden de encolado ES el orden de aplicación: comenzar antes que
       *  finalizar, crear antes que marcar. */
      cola.createIndex("por-creacion", "creadaEn");
      base.createObjectStore("cache", { keyPath: "clave" });
    },
  });
  return promesaBd;
}

// ── Cola ─────────────────────────────────────────────────────────────

export async function encolar(
  operacion: Omit<OperacionEncolada, "creadaEn" | "intentos" | "estado">,
): Promise<OperacionEncolada> {
  const entrada: OperacionEncolada = {
    ...operacion,
    creadaEn: Date.now(),
    intentos: 0,
    estado: "pendiente",
  };
  await (await bd()).put("cola", entrada);
  return entrada;
}

/** Operaciones listas para enviar, en orden de encolado. */
export async function pendientes(): Promise<OperacionEncolada[]> {
  const todas = await (await bd()).getAllFromIndex("cola", "por-creacion");
  return todas.filter((o) => o.estado === "pendiente");
}

/** Las que el servidor rechazó de forma definitiva. */
export async function fallidas(): Promise<OperacionEncolada[]> {
  const todas = await (await bd()).getAllFromIndex("cola", "por-creacion");
  return todas.filter((o) => o.estado === "fallida");
}

export async function eliminar(opId: string) {
  await (await bd()).delete("cola", opId);
}

export async function marcarFallida(opId: string, error: string) {
  const base = await bd();
  const entrada = await base.get("cola", opId);
  if (!entrada) return;
  await base.put("cola", {
    ...entrada,
    estado: "fallida",
    error,
    intentos: entrada.intentos + 1,
  });
}

export async function anotarIntento(opId: string, error: string) {
  const base = await bd();
  const entrada = await base.get("cola", opId);
  if (!entrada) return;
  await base.put("cola", {
    ...entrada,
    intentos: entrada.intentos + 1,
    error,
  });
}

/**
 * Descarta una operación permanentemente fallida.
 *
 * Lo hace el comercial desde la pantalla de cola, tras leer el motivo. No se
 * borran solas: una operación que el servidor rechazó representa trabajo real
 * que alguien hizo, y desaparecer sin avisar es peor que ocupar sitio.
 */
export async function descartar(opId: string) {
  await eliminar(opId);
}

// ── Caché de lectura ─────────────────────────────────────────────────

export async function guardarCache(clave: string, datos: unknown) {
  await (await bd()).put("cache", { clave, datos, guardadoEn: Date.now() });
}

export async function leerCache<T>(
  clave: string,
): Promise<{ datos: T; guardadoEn: number } | null> {
  const entrada = await (await bd()).get("cache", clave);
  return entrada ? { datos: entrada.datos as T, guardadoEn: entrada.guardadoEn } : null;
}

/**
 * Vacía todo. Se llama al cerrar sesión.
 *
 * Si no, el siguiente comercial que use ese dispositivo —habitual con móviles
 * compartidos entre turnos— vería la ruta y las visitas del anterior.
 */
export async function limpiar() {
  const base = await bd();
  await base.clear("cola");
  await base.clear("cache");
}
