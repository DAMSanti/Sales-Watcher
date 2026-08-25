import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { categorias } from "./catalogos";
import {
  ambitoEvidenciaEnum,
  estadoIncidenciaEnum,
  idPk,
  marcasTiempo,
  prioridadEnum,
  punto,
  tipoEvidenciaEnum,
} from "./comunes";
import { resultadosChecklist } from "./checklist";
import { usuarios } from "./usuarios";
import { visitas } from "./visitas";

/**
 * Incidencias y oportunidades reportadas durante una visita.
 *
 * Referencia la categoría por `categoriaId`, NUNCA guarda su texto: si guardara
 * el texto, renombrar una categoría reescribiría retroactivamente lo que
 * reportaron los comerciales (ANEXO §5).
 *
 * `descripcion` es texto libre del comercial y no se traduce: es un dato de
 * campo en el idioma de quien lo escribió, no contenido configurable.
 */
export const incidencias = pgTable(
  "incidencias",
  {
    id: idPk(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visitas.id),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categorias.id),
    descripcion: text("descripcion"),
    prioridad: prioridadEnum("prioridad").notNull().default("media"),
    estado: estadoIncidenciaEnum("estado").notNull().default("abierta"),

    asignadoA: uuid("asignado_a").references(() => usuarios.id),
    resueltaEn: timestamp("resuelta_en", { withTimezone: true, mode: "date" }),
    notaResolucion: text("nota_resolucion"),

    idCliente: text("id_cliente"),
    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("incidencias_id_cliente_unico").on(t.idCliente),
    porVisita: index("incidencias_visita_idx").on(t.visitaId),
    /** La bandeja del supervisor filtra por estado y prioridad. */
    porEstadoPrioridad: index("incidencias_estado_prioridad_idx").on(
      t.estado,
      t.prioridad,
    ),
  }),
);
