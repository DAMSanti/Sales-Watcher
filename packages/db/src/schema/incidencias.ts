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
  ambitoFotoEnum,
  estadoIncidenciaEnum,
  idPk,
  marcasTiempo,
  prioridadEnum,
  punto,
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

/**
 * Fotografías de la visita.
 *
 * Una foto puede colgar de tres ámbitos distintos (SPECS §5.4): de un ítem de
 * checklist, de una incidencia, o de la visita en general. Se modela con un
 * discriminador `ambito` más tres claves foráneas nullable en lugar de tres
 * tablas: comparten metadatos, ciclo de vida y política de retención, y el
 * proceso de purga necesita recorrerlas todas por igual.
 */
export const fotos = pgTable(
  "fotos",
  {
    id: idPk(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visitas.id),
    ambito: ambitoFotoEnum("ambito").notNull(),
    resultadoChecklistId: uuid("resultado_checklist_id").references(
      () => resultadosChecklist.id,
    ),
    incidenciaId: uuid("incidencia_id").references(() => incidencias.id),

    /** Clave en el almacenamiento de objetos. Nunca una URL firmada: caducan. */
    claveAlmacenamiento: text("clave_almacenamiento").notNull(),
    tipoMime: text("tipo_mime").notNull(),
    /** Tamaño ya comprimido en el dispositivo, en bytes. */
    tamanoBytes: integer("tamano_bytes").notNull(),
    anchoPx: integer("ancho_px"),
    altoPx: integer("alto_px"),

    /** Momento de la captura en el dispositivo, no de la subida. */
    capturadaEn: timestamp("capturada_en", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ubicacion: punto("ubicacion"),

    /**
     * Momento en que el servidor comprobó que el fichero está realmente en el
     * almacenamiento.
     *
     * El dispositivo sube directo al almacenamiento con una URL firmada, sin
     * pasar por la API, así que la fila se crea ANTES de que el fichero
     * exista. Mientras `confirmadaEn` sea null, la foto es una reserva: puede
     * que la subida nunca se completara porque el comercial perdió cobertura
     * a mitad.
     *
     * Sin este campo, un ítem de checklist que "requiere foto" quedaría
     * satisfecho por una fila que apunta a un objeto inexistente.
     */
    confirmadaEn: timestamp("confirmada_en", {
      withTimezone: true,
      mode: "date",
    }),

    /**
     * Fecha a partir de la cual el proceso de purga puede borrar el fichero.
     *
     * El plazo de retención sigue sin decidirse por negocio, pero el mecanismo
     * existe desde v1: el número es un parámetro, el proceso es el trabajo.
     * Null = conservar indefinidamente. Cuando se fije la política habrá que
     * rellenar este campo retroactivamente (ANEXO §2, nota sobre P7).
     */
    expiraEn: timestamp("expira_en", { withTimezone: true, mode: "date" }),

    idCliente: text("id_cliente"),
    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("fotos_id_cliente_unico").on(t.idCliente),
    porVisita: index("fotos_visita_idx").on(t.visitaId),
    porIncidencia: index("fotos_incidencia_idx").on(t.incidenciaId),
    /** El proceso de purga barre por fecha de expiración. */
    porExpiracion: index("fotos_expira_en_idx").on(t.expiraEn),
    /** Y también recoge las reservas que nunca llegaron a completarse. */
    porConfirmacion: index("fotos_confirmada_en_idx").on(t.confirmadaEn),
  }),
);
