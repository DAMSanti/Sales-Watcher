import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { motivosNoRealizacion } from "./catalogos";
import {
  estadoRevisionEnum,
  estadoVisitaEnum,
  idPk,
  marcasTiempo,
  punto,
} from "./comunes";
import { tiendas } from "./tiendas";
import { usuarios } from "./usuarios";

/**
 * Ruta planificada: qué tiendas debe visitar un comercial un día dado.
 *
 * No hay franjas horarias. El comercial organiza su jornada como quiera y solo
 * importa que las visitas se hagan durante el día; `ordenSugerido` es
 * orientativo y no se valida ni se penaliza (ANEXO, decisión que cierra P3).
 */
export const rutasDiarias = pgTable(
  "rutas_diarias",
  {
    id: idPk(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    tiendaId: uuid("tienda_id")
      .notNull()
      .references(() => tiendas.id),
    /**
     * Fecha LOCAL sin zona horaria, deliberadamente.
     *
     * Una jornada laboral es un día del calendario del comercial, no un
     * instante universal. Guardarla como timestamp obligaría a decidir una
     * hora arbitraria y produciría desplazamientos de día al convertir zonas.
     */
    fecha: date("fecha").notNull(),
    ordenSugerido: integer("orden_sugerido"),
    ...marcasTiempo,
  },
  (t) => ({
    /** Una tienda no se asigna dos veces al mismo comercial el mismo día. */
    asignacionUnica: uniqueIndex("rutas_diarias_unica").on(
      t.usuarioId,
      t.tiendaId,
      t.fecha,
    ),
    porUsuarioFecha: index("rutas_diarias_usuario_fecha_idx").on(t.usuarioId, t.fecha),
  }),
);

/**
 * Visita a una tienda. Es la entidad central del sistema.
 *
 * Ciclo de vida (SPECS §5.4, §5.5):
 *
 *     pendiente ──"Comenzar visita"──> en_curso ──"Finalizar"──> finalizada
 *         │
 *         └──"No he podido visitarla" / cierre de jornada──> no_realizada
 *
 * `finalizada` y `no_realizada` son TERMINALES: la visita pasa a solo lectura
 * para preservar la integridad del registro. Si el dato se pudiera retocar
 * después, dejaría de servir como evidencia en disputas.
 */
export const visitas = pgTable(
  "visitas",
  {
    id: idPk(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    tiendaId: uuid("tienda_id")
      .notNull()
      .references(() => tiendas.id),
    /** Null en visitas no planificadas, creadas con el botón "Añadir visita". */
    rutaDiariaId: uuid("ruta_diaria_id").references(() => rutasDiarias.id),
    fecha: date("fecha").notNull(),

    estado: estadoVisitaEnum("estado").notNull().default("pendiente"),

    /**
     * Distingue cobertura planificada de oportunista en los informes, y permite
     * detectar patrones (un comercial que casi nunca sigue la ruta asignada).
     */
    planificada: boolean("planificada").notNull().default(true),

    horaInicio: timestamp("hora_inicio", { withTimezone: true, mode: "date" }),
    ubicacionInicio: punto("ubicacion_inicio"),
    horaFin: timestamp("hora_fin", { withTimezone: true, mode: "date" }),
    ubicacionFin: punto("ubicacion_fin"),

    /**
     * Visita cerrada con ítems obligatorios del checklist sin completar.
     *
     * Se permite finalizar así a propósito: hay razones legítimas (el producto
     * ya no está, la cámara falla) y bloquear al comercial por un problema que
     * no es suyo destruye la adopción. Se marca en vez de impedir.
     */
    incompleta: boolean("incompleta").notNull().default(false),

    /**
     * Solo relevante cuando `estado = 'no_realizada'`.
     *
     * Una visita no realizada tiene dos desenlaces distintos: justificada, o
     * NO justificada porque el comercial dejó pasar la ventana diaria. El
     * backoffice debe separarlos, porque no es lo mismo "no fui porque la
     * tienda estaba cerrada" que "no fui y no dije por qué"
     * (ANEXO, decisión que cierra P12).
     */
    justificada: boolean("justificada").notNull().default(false),

    notasLibres: text("notas_libres"),

    /**
     * Identificador generado por el cliente antes de encolar la operación.
     *
     * Es lo que hace idempotente la sincronización offline: si la cola
     * reintenta un envío que sí llegó, el servidor reconoce el duplicado en
     * lugar de crear una segunda visita (ANEXO §5, "sincronización offline").
     */
    idCliente: text("id_cliente"),

    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("visitas_id_cliente_unico").on(t.idCliente),
    porUsuarioFecha: index("visitas_usuario_fecha_idx").on(t.usuarioId, t.fecha),
    porTienda: index("visitas_tienda_idx").on(t.tiendaId),
    /** El dashboard del día filtra por estado y fecha constantemente. */
    porEstadoFecha: index("visitas_estado_fecha_idx").on(t.estado, t.fecha),
  }),
);

/**
 * Justificación de una visita planificada que no se realizó.
 *
 * La ventana es diaria: se justifica antes de terminar la jornada, y no se
 * puede justificar el viernes una visita del martes.
 */
export const justificaciones = pgTable(
  "justificaciones",
  {
    id: idPk(),
    visitaId: uuid("visita_id")
      .notNull()
      .unique()
      .references(() => visitas.id),
    motivoId: uuid("motivo_id")
      .notNull()
      .references(() => motivosNoRealizacion.id),
    comentario: text("comentario"),

    /**
     * Hora de captura EN EL DISPOSITIVO. Es la que valida la ventana diaria.
     *
     * CRÍTICO: no usar `recibidaEn` para esta comprobación. El comercial puede
     * justificar a las 19:55 sin cobertura y que la cola no sincronice hasta
     * las 21:30; rechazar entonces por ventana cerrada sería castigarle por el
     * fallo de red que el modo offline existe precisamente para absorber
     * (ANEXO §3, riesgo alto).
     */
    capturadaEn: timestamp("capturada_en", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    /** Hora de llegada al servidor. Solo auditoría; nunca valida la ventana. */
    recibidaEn: timestamp("recibida_en", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    revisadaPor: uuid("revisada_por").references(() => usuarios.id),
    estadoRevision: estadoRevisionEnum("estado_revision")
      .notNull()
      .default("pendiente"),
    revisadaEn: timestamp("revisada_en", { withTimezone: true, mode: "date" }),

    idCliente: text("id_cliente"),
    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("justificaciones_id_cliente_unico").on(t.idCliente),
    porEstadoRevision: index("justificaciones_estado_revision_idx").on(
      t.estadoRevision,
    ),
  }),
);
