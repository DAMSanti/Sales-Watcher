import { jsonb, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import type { TextoI18n } from "@sw/shared";

/**
 * Tipos y helpers compartidos por todas las tablas.
 *
 * Dos convenciones que atraviesan el esquema entero:
 *
 * 1. Todas las marcas de tiempo son `timestamptz` y se almacenan en UTC.
 *    La conversión a la zona del comercial ocurre solo en presentación (SPECS §4).
 *    La única excepción es `ruta_diaria.fecha`, que es una fecha local sin zona.
 *
 * 2. El contenido configurable traducible se guarda como JSONB con una clave
 *    por idioma. Se eligió JSONB sobre tablas de traducción porque el volumen
 *    es bajo y siempre se lee junto a su entidad (ANEXO, decisión que cierra P5).
 */

/** Columna JSONB con una entrada por idioma: { es, eu, ca, fr, en }. */
export const textoI18n = (nombre: string) => jsonb(nombre).$type<TextoI18n>();

/** Clave primaria UUID generada en base de datos. */
export const idPk = () => uuid("id").primaryKey().defaultRandom();

/**
 * Marcas de auditoría presentes en todas las tablas.
 * `creado_en` / `actualizado_en` responden "cuándo", el registro de auditoría
 * (tabla `auditoria`) responde "quién y qué" (SPECS §8).
 */
export const marcasTiempo = {
  creadoEn: timestamp("creado_en", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ── Enumeraciones del dominio ──────────────────────────────────────────

export const idiomaEnum = pgEnum("idioma", ["es", "eu", "ca", "fr", "en"]);

export const rolEnum = pgEnum("rol", ["comercial", "supervisor", "administrador"]);

/**
 * Estados de una visita (SPECS §5.4 y §5.5).
 * `finalizada` y `no_realizada` son terminales: la visita pasa a solo lectura.
 */
export const estadoVisitaEnum = pgEnum("estado_visita", [
  "pendiente",
  "en_curso",
  "finalizada",
  "no_realizada",
]);

/**
 * Procedencia de la ficha de tienda. En v1 solo se usan `manual` y `csv`,
 * pero `erp` existe desde ya para que la integración futura no exija migrar
 * datos (ANEXO, decisión que cierra P2).
 */
export const origenTiendaEnum = pgEnum("origen_tienda", ["manual", "csv", "erp"]);

export const tipoCategoriaEnum = pgEnum("tipo_categoria", ["incidencia", "oportunidad"]);

export const prioridadEnum = pgEnum("prioridad", ["baja", "media", "alta", "critica"]);

export const estadoIncidenciaEnum = pgEnum("estado_incidencia", [
  "abierta",
  "en_revision",
  "resuelta",
  "descartada",
]);

/** Revisión que hace el supervisor sobre una justificación (SPECS §6.2). */
export const estadoRevisionEnum = pgEnum("estado_revision", [
  "pendiente",
  "aceptada",
  "cuestionada",
]);

/** Ámbito al que se asocia una fotografía (SPECS §5.4). */
export const ambitoFotoEnum = pgEnum("ambito_foto", [
  "visita",
  "checklist",
  "incidencia",
]);

// ── Geolocalización ────────────────────────────────────────────────────

/**
 * Punto capturado por el dispositivo, como JSONB opcional.
 *
 * Se guarda embebido en lugar de usar PostGIS porque el único cálculo previsto
 * es la distancia entre el check-in y la tienda, que no justifica la extensión.
 *
 * `precisionM` viene de la API de geolocalización del navegador y es necesaria
 * para interpretar la desviación: 30 metros de diferencia no significan lo mismo
 * con precisión de 5 m que con precisión de 500 m. Sin ese dato, la señal de
 * alerta al supervisor produciría falsos positivos dentro de centros comerciales
 * (SPECS §11, "evitar trampas").
 *
 * Es nullable a propósito: el comercial puede denegar el permiso de ubicación
 * o el GPS puede no fijar posición, y eso no debe impedir registrar la visita.
 */
export const punto = (nombre: string) => jsonb(nombre).$type<Punto>();

export type Punto = {
  lat: number;
  lon: number;
  /** Radio de incertidumbre en metros que reporta el dispositivo. */
  precisionM: number;
  /** Momento de la lectura GPS, que puede no coincidir con el del evento. */
  capturadoEn: string;
};
