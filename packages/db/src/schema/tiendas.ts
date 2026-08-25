import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tiposTienda, zonas } from "./catalogos";
import { canalEnum, idPk, marcasTiempo, origenTiendaEnum, punto } from "./comunes";

/**
 * Catálogo de tiendas.
 *
 * En v1 se gestiona manualmente desde el backoffice, con importación CSV como
 * paso intermedio. La integración con ERP está fuera de alcance, pero los tres
 * campos que necesitará (`idExterno`, `origen`, `sincronizadoEn`) existen desde
 * ya: añadirlos ahora cuesta minutos, añadirlos con 3.000 tiendas y un año de
 * visitas apuntando a ellas es una migración con riesgo
 * (ANEXO, decisión que cierra P2).
 *
 * REGLA IMPORTANTE: `numeroReferencia` es un dato de negocio visible, NO la
 * clave primaria. Cuando llegue el ERP la correspondencia se hará por
 * `idExterno`. Si el histórico de visitas colgara del número de referencia y
 * el ERP lo cambiase durante la migración, se rompería.
 */
export const tiendas = pgTable(
  "tiendas",
  {
    id: idPk(),
    nombre: text("nombre").notNull(),
    numeroReferencia: text("numero_referencia").notNull(),

    direccion: text("direccion"),
    localidad: text("localidad"),
    codigoPostal: text("codigo_postal"),
    /** Ubicación oficial, contra la que se compara el check-in del comercial. */
    ubicacion: punto("ubicacion"),

    zonaId: uuid("zona_id").references(() => zonas.id),
    tipoTiendaId: uuid("tipo_tienda_id").references(() => tiposTienda.id),

    /**
     * Canal comercial: Modern (gran superficie) o Proximity (proximidad).
     *
     * Se guarda para segmentar informes y dejar preparado el futuro, pero
     * **ningún flujo se bifurca por canal**: la función del GPV es la misma en
     * ambos. Si algún día hiciera falta diferenciarlos, se resolvería por
     * configuración de flujos y no con un `if` en la app
     * (ANEXO, decisión que cierra P27).
     *
     * Nullable porque el catálogo actual se cargó sin este dato.
     */
    canal: canalEnum("canal"),

    // ── Preparación para el ERP (sin uso funcional en v1) ──────────────
    /** Clave en el sistema de origen. Es la que usará el ERP para casar fichas. */
    idExterno: text("id_externo"),
    origen: origenTiendaEnum("origen").notNull().default("manual"),
    sincronizadoEn: timestamp("sincronizado_en", {
      withTimezone: true,
      mode: "date",
    }),

    activo: boolean("activo").notNull().default(true),
    ...marcasTiempo,
  },
  (t) => ({
    /**
     * El número de referencia es único entre tiendas activas, pero se permite
     * reutilizarlo si la anterior fue dada de baja: durante una migración de
     * ERP es habitual que se reasignen.
     */
    referenciaIdx: index("tiendas_numero_referencia_idx").on(t.numeroReferencia),
    /** Un `idExterno` no puede apuntar a dos fichas: rompería la sincronización. */
    idExternoUnico: uniqueIndex("tiendas_id_externo_unico").on(t.idExterno),
    porZona: index("tiendas_zona_idx").on(t.zonaId),
    /** El buscador de "Añadir visita" filtra por nombre sobre tiendas activas. */
    porNombre: index("tiendas_nombre_idx").on(t.nombre),
  }),
);
