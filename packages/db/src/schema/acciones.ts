import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { marcas, referenciasProducto } from "./catalogos";
import {
  categoriaProductoEnum,
  correccionHuecoEnum,
  desenlaceComprobacionEnum,
  estadoAccionEnum,
  idPk,
  marcasTiempo,
  motivoExtraespacioEnum,
  prioridadEnum,
  problemaFechasEnum,
  propuestaVisibilidadEnum,
  responsableActuarEnum,
  rolEnum,
  situacionNeveraEnum,
  suficienciaStockEnum,
  tipoExtraespacioEnum,
  tipoSituacionEnum,
  ubicacionLinealEnum,
  valoracionRelacionEnum,
} from "./comunes";
import { tiendas } from "./tiendas";
import { usuarios } from "./usuarios";
import { visitas } from "./visitas";

/**
 * El ciclo detección → acción → seguimiento → resultado (SPECS §5.8).
 *
 * Es la pieza que distingue este sistema de un registro de actividad: lo que se
 * detecta en una visita **no desaparece al cerrarla**, queda abierto hasta que
 * hay un resultado, y reaparece en la siguiente visita a esa tienda.
 */

/**
 * Una acción abierta sobre una tienda.
 *
 * REGLA CENTRAL: la acción **cuelga de la tienda, no de la visita**. La visita
 * es solo el momento en que se detectó. Colgarla de `visitaId` es lo natural si
 * uno piensa en pantallas, y convierte el seguimiento entre visitas en una
 * consulta retorcida: habría que recorrer todas las visitas anteriores de esa
 * tienda para saber qué sigue pendiente.
 *
 * `visitaOrigenId` se conserva para poder responder "¿dónde se detectó esto?",
 * pero no es la relación que manda.
 */
export const acciones = pgTable(
  "acciones",
  {
    id: idPk(),

    /** La dueña de la acción. */
    tiendaId: uuid("tienda_id")
      .notNull()
      .references(() => tiendas.id),
    /** Dónde se detectó. Informativo: no gobierna el ciclo de vida. */
    visitaOrigenId: uuid("visita_origen_id")
      .notNull()
      .references(() => visitas.id),

    categoriaProducto: categoriaProductoEnum("categoria_producto").notNull(),
    tipoSituacion: tipoSituacionEnum("tipo_situacion").notNull(),

    /**
     * Quién debe actuar. Lo calcula el servidor con `resolverResponsable`
     * (`@sw/shared`), nunca lo elige el GPV: si fuera una elección, la misma
     * situación escalaría distinto según quién la registrase y los agregados
     * del dashboard dejarían de ser comparables.
     *
     * Se **almacena** en lugar de recalcularse al leer. Es deliberado: si la
     * regla cambia, las acciones ya abiertas conservan el responsable con el
     * que nacieron. Recalcular reasignaría histórico en silencio, y alguien
     * que tenía algo en su bandeja lo vería desaparecer sin explicación.
     */
    responsableActuar: responsableActuarEnum("responsable_actuar").notNull(),

    estado: estadoAccionEnum("estado").notNull().default("abierta"),
    prioridad: prioridadEnum("prioridad").notNull().default("media"),

    /**
     * Cuándo se detectó. Es la marca de tiempo del dispositivo, no la de
     * llegada al servidor: con modo offline pueden separarse horas, y la
     * antigüedad de la que sale "estancada" debe contarse desde la detección
     * real.
     */
    detectadaEn: timestamp("detectada_en", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resueltaEn: timestamp("resuelta_en", { withTimezone: true, mode: "date" }),

    /**
     * Quién cerró la acción y con qué rol.
     *
     * GPV y FSM pueden cerrar (ANEXO, decisión que cierra P23). Sin esta traza
     * no habría forma de saber si una acción de Dairy la cerró el FSM tras
     * hablar con el reponedor, o el GPV al ver el hueco ya cubierto — y el
     * panel del FSM necesita avisar precisamente del segundo caso.
     */
    cerradaPor: uuid("cerrada_por").references(() => usuarios.id),
    cerradaPorRol: rolEnum("cerrada_por_rol"),
    /** Texto libre de quien cierra. No se traduce: es dato de campo. */
    notaResultado: text("nota_resultado"),

    /**
     * Idempotencia de la cola offline: identificador que genera el dispositivo.
     * Sigue el mismo patrón que visitas, incidencias y fotos.
     */
    idCliente: text("id_cliente"),
    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("acciones_id_cliente_unico").on(t.idCliente),

    /**
     * La consulta más frecuente de la app de campo: qué sigue abierto en esta
     * tienda, para traerlo al iniciar la visita.
     */
    abiertasPorTienda: index("acciones_tienda_estado_idx").on(t.tiendaId, t.estado),

    /**
     * El panel del FSM ordena por antigüedad, que es de donde sale "estancada".
     * No hay columna `estancada`: se deriva comparando `detectadaEn` con el
     * umbral configurado (SPECS §7.1).
     */
    porAntiguedad: index("acciones_estado_detectada_idx").on(t.estado, t.detectadaEn),

    porResponsable: index("acciones_responsable_idx").on(t.responsableActuar, t.estado),
    porVisitaOrigen: index("acciones_visita_origen_idx").on(t.visitaOrigenId),
  }),
);

/**
 * Cada vez que alguien se pronuncia sobre una acción abierta.
 *
 * REGLA: esto es un **registro de eventos**, no un campo de estado. Cada
 * comprobación se añade; ninguna sobreescribe a la anterior.
 *
 * Guardar solo el último estado en `acciones.estado` haría imposible responder
 * "¿cuánto tardó en resolverse?" y "¿cuántas veces hubo que volver?", que son
 * dos de las preguntas explícitas del dashboard (SPECS §6.4). El estado de la
 * acción es un resumen conveniente; la verdad está aquí.
 */
export const comprobacionesAccion = pgTable(
  "comprobaciones_accion",
  {
    id: idPk(),
    accionId: uuid("accion_id")
      .notNull()
      .references(() => acciones.id),
    /** La visita en la que se comprobó. Null si la cerró el FSM desde el panel. */
    visitaId: uuid("visita_id").references(() => visitas.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),

    desenlace: desenlaceComprobacionEnum("desenlace").notNull(),
    comentario: text("comentario"),

    /** Momento de la comprobación en el dispositivo, no de llegada al servidor. */
    comprobadaEn: timestamp("comprobada_en", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    idCliente: text("id_cliente"),
    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("comprobaciones_id_cliente_unico").on(t.idCliente),
    /** Reconstruir la historia de una acción en orden. */
    porAccion: index("comprobaciones_accion_idx").on(t.accionId, t.comprobadaEn),
    porVisita: index("comprobaciones_visita_idx").on(t.visitaId),
  }),
);

// ── Detalle tipificado por flujo (SPECS §5.5) ──────────────────────────
//
// Una tabla por flujo, no una `Accion` con `detalle` en JSONB. Lo decide el
// dashboard: `facings_ganados` hay que SUMARLO, y las preguntas de repetición
// comparan campos concretos entre visitas. Con JSONB eso depende de consultas
// sobre estructuras sin garantías de forma, y el primer flujo guardado con una
// clave mal escrita rompe un agregado en silencio.
//
// Coste asumido y explícito: añadir un flujo nuevo es una migración
// (ANEXO, decisión que cierra P24).
//
// Todas referencian `accionId` de forma única: es una relación 1:1 que extiende
// la acción con lo que solo tiene sentido para su tipo.

/** ¿Hay suficiente producto para cubrir la jornada? (SPECS §5.5.1) */
export const deteccionesStock = pgTable("detecciones_stock", {
  id: idPk(),
  accionId: uuid("accion_id")
    .notNull()
    .unique()
    .references(() => acciones.id),
  /** `reponedor_no_ha_pasado` solo debe llegar en Dairy. */
  suficiencia: suficienciaStockEnum("suficiencia").notNull(),
  /**
   * Solo aplica en Waters y PBB, donde el GPV negocia con el encargado.
   * En Dairy escala al FSM y no hay nada que comunicar en tienda.
   */
  comunicadoAlResponsable: boolean("comunicado_al_responsable"),
  ...marcasTiempo,
});

/** Comprobación visual de fechas. Exclusiva de Dairy (SPECS §5.5.2). */
export const deteccionesFechas = pgTable("detecciones_fechas", {
  id: idPk(),
  accionId: uuid("accion_id")
    .notNull()
    .unique()
    .references(() => acciones.id),
  problema: problemaFechasEnum("problema").notNull(),
  /** Obligatorio cuando el problema es `otro`. */
  detalle: text("detalle"),
  ...marcasTiempo,
});

/**
 * Hueco en el lineal (SPECS §5.5.3).
 *
 * Los dos campos opcionales son excluyentes por categoría, y esa es la razón
 * de que la tabla parezca tener huecos: en Dairy se registra si el reponedor
 * cubrió el espacio con una referencia adyacente; en Waters y PBB se registra
 * si el propio GPV lo corrigió. Son dos preguntas distintas, no la misma con
 * distinto destinatario.
 */
export const deteccionesHueco = pgTable("detecciones_hueco", {
  id: idPk(),
  accionId: uuid("accion_id")
    .notNull()
    .unique()
    .references(() => acciones.id),
  existeHueco: boolean("existe_hueco").notNull(),
  /** Solo Dairy: ¿lo cubrió una referencia Danone adyacente? */
  cubiertoConAdyacente: boolean("cubierto_con_adyacente"),
  /** Solo Waters/PBB: resultado de la actuación del propio GPV. */
  correccion: correccionHuecoEnum("correccion"),
  ...marcasTiempo,
});

/**
 * Referencia Top Pico ausente del surtido (SPECS §5.5.4).
 *
 * `referenciaId` apunta al catálogo, no es texto libre: con texto libre, la
 * misma referencia escrita de dos maneras rompería el seguimiento entre
 * visitas, que es lo que hace valiosa esta tabla.
 */
export const topPicosPendientes = pgTable(
  "top_picos_pendientes",
  {
    id: idPk(),
    accionId: uuid("accion_id")
      .notNull()
      .unique()
      .references(() => acciones.id),
    referenciaId: uuid("referencia_id")
      .notNull()
      .references(() => referenciasProducto.id),
    incorporada: boolean("incorporada").notNull().default(false),
    incorporadaEn: timestamp("incorporada_en", { withTimezone: true, mode: "date" }),
    ...marcasTiempo,
  },
  (t) => ({
    /** "¿Cuántos Top Picos hemos conseguido incorporar?" (dashboard, pregunta 5). */
    porReferencia: index("top_picos_referencia_idx").on(t.referenciaId, t.incorporada),
  }),
);

/**
 * Facings ganados (SPECS §5.5.5).
 *
 * `facingsGanados` es la única cifra del sistema que se **suma** directamente
 * para producir un resultado de negocio: "+30 facings este mes". De ahí que sea
 * un entero y no texto, y que el índice cubra las dimensiones por las que el
 * dashboard agrega.
 *
 * A propósito no se guarda cuántos facings había antes ni cuántos hay después:
 * el GPV no debe perder tiempo contando el lineal, solo declarar el incremento.
 */
export const gananciasFacings = pgTable(
  "ganancias_facings",
  {
    id: idPk(),
    accionId: uuid("accion_id")
      .notNull()
      .unique()
      .references(() => acciones.id),
    marcaId: uuid("marca_id").references(() => marcas.id),
    conseguido: boolean("conseguido").notNull().default(false),
    /** Solo el incremento. Cero mientras la oportunidad siga sin materializarse. */
    facingsGanados: integer("facings_ganados").notNull().default(0),
    ...marcasTiempo,
  },
  (t) => ({
    porMarca: index("ganancias_facings_marca_idx").on(t.marcaId, t.conseguido),
  }),
);

/** Oportunidad de mejorar la ubicación en el lineal (SPECS §5.5.6). */
export const oportunidadesVisibilidad = pgTable("oportunidades_visibilidad", {
  id: idPk(),
  accionId: uuid("accion_id")
    .notNull()
    .unique()
    .references(() => acciones.id),
  marcaId: uuid("marca_id").references(() => marcas.id),
  ubicacionActual: ubicacionLinealEnum("ubicacion_actual").notNull(),
  propuesta: propuestaVisibilidadEnum("propuesta").notNull(),
  ...marcasTiempo,
});

/**
 * Propuesta de reorganización del lineal (SPECS §5.5.7).
 *
 * El único flujo esencialmente abierto, y con razón: un cambio estructural del
 * lineal no se deja tipificar en un desplegable. El texto es del GPV y no se
 * traduce.
 */
export const oportunidadesReorganizacion = pgTable("oportunidades_reorganizacion", {
  id: idPk(),
  accionId: uuid("accion_id")
    .notNull()
    .unique()
    .references(() => acciones.id),
  propuesta: text("propuesta").notNull(),
  ...marcasTiempo,
});

/** Punto de carga adicional fuera del lineal (SPECS §5.5.8). */
export const extraespacios = pgTable("extraespacios", {
  id: idPk(),
  accionId: uuid("accion_id")
    .notNull()
    .unique()
    .references(() => acciones.id),
  tipo: tipoExtraespacioEnum("tipo").notNull(),
  motivo: motivoExtraespacioEnum("motivo").notNull(),
  ...marcasTiempo,
});

/**
 * Neveras (SPECS §5.5.9).
 *
 * Cuelga de `extraespacios` porque el boceto considera la nevera un tipo de
 * extraespacio, y aquí solo se añade lo que es específico suyo.
 *
 * ATENCIÓN con `codigoNevera`: **no es un dato interno, es un puente a otro
 * sistema**. El FSM lo usa para informar en su propia aplicación de neveras, y
 * existe para que no se retire la unidad equivocada. Por eso:
 *
 * - Se guarda **tal cual se escribe**. Normalizarlo —recortar, mayúsculas,
 *   quitar guiones— puede romper la correspondencia con esa otra aplicación.
 * - Conviene acompañarlo de una foto del propio código, para verificar una
 *   transcripción dudosa sin volver a la tienda.
 * - Está **dentro** de la nevera: leerlo exige abrirla.
 *
 * Y cerrar una acción de nevera significa "informado en la aplicación de
 * neveras", NO "nevera recogida".
 */
export const neveras = pgTable(
  "neveras",
  {
    id: idPk(),
    extraespacioId: uuid("extraespacio_id")
      .notNull()
      .unique()
      .references(() => extraespacios.id),
    situacion: situacionNeveraEnum("situacion").notNull(),
    /** Obligatorio cuando la situación implica retirada o recogida. */
    codigoNevera: text("codigo_nevera"),
    ...marcasTiempo,
  },
  (t) => ({
    /** El FSM busca por código cuando cruza datos con su aplicación de neveras. */
    porCodigo: index("neveras_codigo_idx").on(t.codigoNevera),
  }),
);

/**
 * Relación con el responsable de tienda (SPECS §5.6).
 *
 * Transversal: **una fila por visita**, no por categoría, porque en cada punto
 * de venta hay un único encargado. De ahí el índice único sobre `visitaId`.
 *
 * No es una acción: no se abre ni se cierra, se acumula. El valor está en el
 * histórico de la relación entre GPV y encargado a lo largo del tiempo.
 *
 * `valoracion` representa la relación **general**, no cómo fue la conversación
 * de ese día. La distinción no es cosmética: determina cómo se lee el
 * histórico, y el enunciado de la interfaz debe dejarla clara.
 */
export const relacionesResponsable = pgTable(
  "relaciones_responsable",
  {
    id: idPk(),
    visitaId: uuid("visita_id")
      .notNull()
      .unique()
      .references(() => visitas.id),
    haHablado: boolean("ha_hablado").notNull(),
    /** Null cuando no ha hablado con él. */
    valoracion: valoracionRelacionEnum("valoracion"),
    cuestionPendiente: boolean("cuestion_pendiente").notNull().default(false),
    /** Texto libre del GPV. No se traduce. */
    comentario: text("comentario"),

    idCliente: text("id_cliente"),
    ...marcasTiempo,
  },
  (t) => ({
    idClienteUnico: uniqueIndex("relaciones_responsable_id_cliente_unico").on(t.idCliente),
  }),
);
