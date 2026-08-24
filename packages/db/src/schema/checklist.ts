import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tiposTienda } from "./catalogos";
import { idPk, marcasTiempo, textoI18n } from "./comunes";
import { visitas } from "./visitas";

/**
 * Plantillas de checklist, configurables desde el backoffice y asignables por
 * tipo de tienda: un hipermercado no necesita las mismas comprobaciones que
 * una tienda de barrio, y un checklist genérico se completa mecánicamente
 * (SPECS §11).
 */
export const plantillasChecklist = pgTable("plantillas_checklist", {
  id: idPk(),
  nombre: textoI18n("nombre").notNull(),
  /** Null = plantilla global, aplicable a cualquier tipo de tienda. */
  tipoTiendaId: uuid("tipo_tienda_id").references(() => tiposTienda.id),
  activo: boolean("activo").notNull().default(true),
  ...marcasTiempo,
});

export const itemsChecklist = pgTable(
  "items_checklist",
  {
    id: idPk(),
    plantillaId: uuid("plantilla_id")
      .notNull()
      .references(() => plantillasChecklist.id),
    texto: textoI18n("texto").notNull(),
    /** El ítem no se puede marcar sin adjuntar fotografía (SPECS §5.4). */
    requiereFoto: boolean("requiere_foto").notNull().default(false),
    /** Si queda sin completar, la visita se marca `incompleta` al finalizar. */
    obligatorio: boolean("obligatorio").notNull().default(false),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
    ...marcasTiempo,
  },
  (t) => ({
    porPlantilla: index("items_checklist_plantilla_idx").on(t.plantillaId),
  }),
);

/**
 * Resultado de un ítem de checklist en una visita concreta.
 *
 * Nota de diseño: la fotografía NO se referencia desde aquí. Es la foto la que
 * apunta al resultado, porque un ítem puede acabar con varias fotos y la
 * relación inversa obligaría a una tabla puente para nada. Ver `fotos`.
 */
export const resultadosChecklist = pgTable(
  "resultados_checklist",
  {
    id: idPk(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visitas.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => itemsChecklist.id),
    completado: boolean("completado").notNull().default(false),
    /** Momento en que el comercial lo marcó, capturado en el dispositivo. */
    completadoEn: timestamp("completado_en", { withTimezone: true, mode: "date" }),
    ...marcasTiempo,
  },
  (t) => ({
    /** Un ítem tiene un único resultado por visita. */
    resultadoUnico: uniqueIndex("resultados_checklist_unico").on(t.visitaId, t.itemId),
    porVisita: index("resultados_checklist_visita_idx").on(t.visitaId),
  }),
);
