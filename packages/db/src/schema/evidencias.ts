import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ambitoEvidenciaEnum,
  idPk,
  marcasTiempo,
  punto,
  tipoEvidenciaEnum,
} from "./comunes";
import { resultadosChecklist } from "./checklist";
import { incidencias } from "./incidencias";
import { visitas } from "./visitas";

/**
 * Evidencias de la visita: fotografías y vídeos.
 *
 * Una evidencia puede colgar de tres ámbitos distintos (SPECS §5.4): de un ítem
 * de checklist, de una incidencia, o de la visita en general. Se modela con un
 * discriminador `ambito` más tres claves foráneas nullable en lugar de tres
 * tablas: comparten metadatos, ciclo de vida y política de retención, y el
 * proceso de purga necesita recorrerlas todas por igual.
 *
 * Foto y vídeo comparten tabla por la misma razón: mismos metadatos, misma
 * reserva-confirmación, misma purga. Lo que los separa —tamaño, duración,
 * normalización— cabe en tres columnas.
 */
export const evidencias = pgTable(
  "evidencias",
  {
    id: idPk(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visitas.id),
    ambito: ambitoEvidenciaEnum("ambito").notNull(),

    /**
     * Foto o vídeo (SPECS §8).
     *
     * Un ítem de checklist que "requiere foto" comprueba `tipo = 'foto'`: un
     * vídeo no lo satisface. La distinción existe porque el requisito de
     * fotografía viene de antes del vídeo y significa lo que dice.
     */
    tipo: tipoEvidenciaEnum("tipo").notNull().default("foto"),
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
    /** Solo en vídeo. Se valida contra el máximo de 60 s antes de encolar. */
    duracionS: integer("duracion_s"),

    /**
     * Momento en que el servidor normalizó el vídeo a 720p H.264/AAC.
     *
     * Null en fotografías, y null también en un vídeo que aún no se ha
     * procesado o cuyo procesado falló. **Nunca se pierde el original por no
     * poder normalizarlo**: si ffmpeg no está disponible, el vídeo queda
     * servible tal cual y este campo lo delata.
     */
    normalizadaEn: timestamp("normalizada_en", { withTimezone: true, mode: "date" }),

    /**
     * Cuántas veces se ha intentado normalizar.
     *
     * Sin este contador, un vídeo que ffmpeg no puede procesar —corrupto, un
     * códec exótico— se reintentaría en cada pasada para siempre, ocupando el
     * proceso y llenando el registro.
     */
    intentosNormalizacion: integer("intentos_normalizacion").notNull().default(0),

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
    idClienteUnico: uniqueIndex("evidencias_id_cliente_unico").on(t.idCliente),
    porVisita: index("evidencias_visita_idx").on(t.visitaId),
    porIncidencia: index("evidencias_incidencia_idx").on(t.incidenciaId),
    /** El proceso de purga barre por fecha de expiración. */
    porExpiracion: index("evidencias_expira_en_idx").on(t.expiraEn),
    /** Y también recoge las reservas que nunca llegaron a completarse. */
    porConfirmacion: index("evidencias_confirmada_en_idx").on(t.confirmadaEn),
    /** La cola de normalización busca vídeos confirmados y sin normalizar. */
    porNormalizar: index("evidencias_normalizar_idx").on(t.tipo, t.normalizadaEn),
  }),
);
