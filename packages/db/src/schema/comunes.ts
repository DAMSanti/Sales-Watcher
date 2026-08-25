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

// ── El ciclo detección → acción → resultado (SPECS §5.5, §5.8) ─────────

/**
 * Las tres categorías de producto del boceto, más `transversal` para lo que no
 * cuelga de ninguna: la relación con el responsable de tienda.
 */
export const categoriaProductoEnum = pgEnum("categoria_producto", [
  "dairy",
  "waters",
  "pbb",
  "transversal",
]);

/**
 * Canal comercial de la tienda.
 *
 * Se guarda para segmentar informes y dejar preparado el futuro, pero **ningún
 * flujo se bifurca por canal**: la función es la misma en ambos
 * (ANEXO, decisión que cierra P27).
 */
export const canalEnum = pgEnum("canal", ["modern", "proximity"]);

/**
 * Situaciones tipificadas que puede detectar el GPV.
 *
 * `nevera` se distingue de `extraespacio` aunque el boceto la considere un tipo
 * de extraespacio, porque **cambia el responsable**: una nevera siempre escala
 * al FSM y el resto los negocia el GPV.
 */
export const tipoSituacionEnum = pgEnum("tipo_situacion", [
  "stock",
  "fechas",
  "hueco",
  "top_pico",
  "facings",
  "visibilidad",
  "reorganizacion",
  "extraespacio",
  "nevera",
  "relacion_responsable",
]);

/** Quién debe actuar. Lo calcula el servidor, nunca lo elige el usuario. */
export const responsableActuarEnum = pgEnum("responsable_actuar", ["gpv", "fsm"]);

/**
 * Estado de una acción.
 *
 * No incluye "estancada" a propósito: eso se deriva de la antigüedad, no es un
 * estado. Como estado permitiría que algo estuviera estancado y resuelto a la
 * vez (SPECS §7.1).
 */
export const estadoAccionEnum = pgEnum("estado_accion", [
  "abierta",
  "en_curso",
  "resuelta",
  "descartada",
]);

/** Desenlace de una comprobación en una visita posterior. */
export const desenlaceComprobacionEnum = pgEnum("desenlace_comprobacion", [
  "sigue_pendiente",
  "resuelta",
  "no_procede",
]);

// ── Opciones de los flujos (SPECS §5.5) ────────────────────────────────

/** La tercera opción solo se ofrece en Dairy: es la única con reponedor propio. */
export const suficienciaStockEnum = pgEnum("suficiencia_stock", [
  "si",
  "no",
  "reponedor_no_ha_pasado",
]);

export const problemaFechasEnum = pgEnum("problema_fechas", [
  "fifo_incorrecto",
  "proximo_caducar",
  "mal_colocado",
  "otro",
]);

/** Resultado de la actuación del propio GPV sobre un hueco (Waters/PBB). */
export const correccionHuecoEnum = pgEnum("correccion_hueco", ["si", "no_posible"]);

export const tipoExtraespacioEnum = pgEnum("tipo_extraespacio", [
  "cabecera",
  "isla",
  "pila",
  "nevera",
  "otro",
]);

export const motivoExtraespacioEnum = pgEnum("motivo_extraespacio", [
  "alta_rotacion",
  "promocion",
  "potencial_venta",
  "falta_espacio_lineal",
  "oportunidad_estacional",
  "otro",
]);

export const situacionNeveraEnum = pgEnum("situacion_nevera", [
  "uso_correcto",
  "uso_parcial",
  "uso_incorrecto",
  "retirada",
  "vacia_desaprovechada",
  "necesita_nueva",
  "necesita_recogida",
  "otro",
]);

/** El «palomar» y el «foso» son las posiciones desfavorables del lineal. */
export const ubicacionLinealEnum = pgEnum("ubicacion_lineal", [
  "palomar",
  "zona_intermedia",
  "altura_ojos",
  "foso",
  "otra",
]);

export const propuestaVisibilidadEnum = pgEnum("propuesta_visibilidad", [
  "subir_producto",
  "bajar_producto",
  "ganar_espacio",
  "cambiar_ubicacion",
  "reorganizar_lineal",
  "otra",
]);

/**
 * Valoración de la relación con el responsable de tienda.
 *
 * Representa la relación **general**, no cómo fue la conversación de ese día
 * (SPECS §5.6). El enunciado de la interfaz debe dejarlo claro.
 */
export const valoracionRelacionEnum = pgEnum("valoracion_relacion", [
  "muy_buena",
  "buena",
  "correcta",
  "mejorable",
  "mala",
  "no_ha_podido_hablar",
]);

/**
 * Tipo de evidencia adjunta.
 *
 * La tabla sigue llamándose `fotos` porque renombrarla a `evidencias` implica
 * un refactor transversal de un módulo que funciona (API, cola offline, purga,
 * app de campo). Se hará cuando se implemente el flujo de vídeo y ese código se
 * toque de todos modos; hasta entonces, este enum es el que manda sobre el
 * nombre de la tabla.
 */
export const tipoEvidenciaEnum = pgEnum("tipo_evidencia", ["foto", "video"]);

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
