import { boolean, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import {
  idPk,
  marcasTiempo,
  prioridadEnum,
  textoI18n,
  tipoCategoriaEnum,
} from "./comunes";

/**
 * Catálogos configurables desde el backoffice.
 *
 * Regla que aplica a todas las tablas de este fichero: **se desactivan, no se
 * borran**. Un borrado real rompería el histórico de visitas que los referencia
 * (ANEXO §5, "catálogos configurables"). Por eso todas llevan `activo` y
 * ninguna relación hacia ellas usa ON DELETE CASCADE.
 *
 * Los textos son JSONB traducible porque el catálogo definitivo aún está en
 * negociación con el cliente y va a cambiar después del arranque: si las
 * incidencias guardasen el texto en vez de la referencia, renombrar una
 * categoría reescribiría retroactivamente lo que reportaron los comerciales.
 */

export const zonas = pgTable("zonas", {
  id: idPk(),
  nombre: textoI18n("nombre").notNull(),
  /** Clave estable para seeds e integraciones; el nombre traducible puede cambiar. */
  codigo: text("codigo").notNull().unique(),
  region: text("region"),
  /**
   * Zona horaria IANA de la zona comercial.
   *
   * Existe porque el proceso de cierre de jornada tiene semántica de "fin del
   * día laboral" y debe ejecutarse en hora local, no de servidor (SPECS §4).
   * Hoy la operación es solo española, así que en la práctica será
   * `Europe/Madrid` salvo Canarias (`Atlantic/Canary`), pendiente de confirmar.
   * Tenerlo como dato evita una migración si eso cambia.
   */
  zonaHoraria: text("zona_horaria").notNull().default("Europe/Madrid"),
  activo: boolean("activo").notNull().default(true),
  ...marcasTiempo,
});

export const tiposTienda = pgTable("tipos_tienda", {
  id: idPk(),
  nombre: textoI18n("nombre").notNull(),
  /** Clave estable para seeds e integraciones; el nombre traducible puede cambiar. */
  codigo: text("codigo").notNull().unique(),
  activo: boolean("activo").notNull().default(true),
  ...marcasTiempo,
});

/**
 * Categorías de incidencia y de oportunidad, en una sola tabla discriminada
 * por `tipo`. Comparten forma y ciclo de vida; separarlas duplicaría la
 * pantalla de gestión sin ganar nada.
 */
export const categorias = pgTable(
  "categorias",
  {
    id: idPk(),
    nombre: textoI18n("nombre").notNull(),
    codigo: text("codigo").notNull(),
    tipo: tipoCategoriaEnum("tipo").notNull(),
    /** Prioridad sugerida al crear; el comercial puede cambiarla. */
    prioridadDefecto: prioridadEnum("prioridad_defecto").notNull().default("media"),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
    ...marcasTiempo,
  },
  (t) => ({
    codigoUnico: uniqueIndex("categorias_codigo_unico").on(t.codigo),
  }),
);

/**
 * Motivos por los que una visita planificada no se realizó (SPECS §5.5).
 *
 * Mantener esta lista CORTA es un requisito de producto, no una preferencia:
 * un catálogo de veinte motivos no se lee, se elige el primero. Y con la
 * ventana de justificación diaria, justificar seis visitas a las 19:50 empuja
 * aún más al primer elemento (ANEXO §4, advertencia de diseño).
 */
export const motivosNoRealizacion = pgTable("motivos_no_realizacion", {
  id: idPk(),
  texto: textoI18n("texto").notNull(),
  codigo: text("codigo").notNull().unique(),
  /** Si es true, la justificación exige comentario libre (caso "Otro"). */
  requiereComentario: boolean("requiere_comentario").notNull().default(false),
  orden: integer("orden").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
  ...marcasTiempo,
});
