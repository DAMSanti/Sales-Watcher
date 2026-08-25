import { opcionesSuficienciaStock, situacionDisponible } from "@sw/shared";
import { z } from "zod";

/**
 * Validación de los flujos de detección (SPECS §5.5).
 *
 * Se modela como unión discriminada por `tipoSituacion` en lugar de un objeto
 * con todos los campos opcionales. La diferencia importa: con campos opcionales,
 * un cliente podría mandar un problema de fechas junto a un código de nevera y
 * el servidor lo aceptaría, dejando una acción con detalle contradictorio que
 * nadie sabría interpretar después.
 *
 * Las reglas que dependen de la categoría (fechas solo en Dairy, "el reponedor
 * todavía no ha pasado" solo en Dairy) se comprueban en `superRefine` usando
 * los helpers de `@sw/shared`, para no tener dos versiones de la misma regla.
 */

const categoriaProducto = z.enum(["dairy", "waters", "pbb"]);

/** Campos comunes a toda detección. */
const comunes = {
  categoriaProducto,
  prioridad: z.enum(["baja", "media", "alta", "critica"]).optional(),
  /**
   * Momento de la detección en el dispositivo, no de llegada al servidor.
   *
   * Con modo offline pueden separarse horas, y la antigüedad de la que sale
   * "estancada" debe contarse desde la detección real. Si se omite, el servidor
   * pone la suya.
   */
  detectadaEn: z.coerce.date().optional(),
  idCliente: z.string().min(1).max(128).optional(),
};

const stock = z.object({
  ...comunes,
  tipoSituacion: z.literal("stock"),
  suficiencia: z.enum(["si", "no", "reponedor_no_ha_pasado"]),
  /** Solo Waters y PBB: en Dairy escala al FSM y no hay nada que comunicar. */
  comunicadoAlResponsable: z.boolean().optional(),
});

const fechas = z.object({
  ...comunes,
  tipoSituacion: z.literal("fechas"),
  problema: z.enum(["fifo_incorrecto", "proximo_caducar", "mal_colocado", "otro"]),
  detalle: z.string().max(2000).optional(),
});

const hueco = z.object({
  ...comunes,
  tipoSituacion: z.literal("hueco"),
  existeHueco: z.boolean(),
  /** Solo Dairy: ¿lo cubrió el reponedor con una referencia adyacente? */
  cubiertoConAdyacente: z.boolean().optional(),
  /** Solo Waters/PBB: resultado de la actuación del propio GPV. */
  correccion: z.enum(["si", "no_posible"]).optional(),
});

const topPico = z.object({
  ...comunes,
  tipoSituacion: z.literal("top_pico"),
  /** Del catálogo de referencias, nunca texto libre: rompería el seguimiento. */
  referenciaId: z.string().uuid(),
});

const facings = z.object({
  ...comunes,
  tipoSituacion: z.literal("facings"),
  marcaId: z.string().uuid().optional(),
  conseguido: z.boolean().default(false),
  /** Solo el incremento. El GPV no cuenta el lineal (SPECS §5.5.5). */
  facingsGanados: z.number().int().min(0).max(100).default(0),
});

const visibilidad = z.object({
  ...comunes,
  tipoSituacion: z.literal("visibilidad"),
  marcaId: z.string().uuid().optional(),
  ubicacionActual: z.enum(["palomar", "zona_intermedia", "altura_ojos", "foso", "otra"]),
  propuesta: z.enum([
    "subir_producto",
    "bajar_producto",
    "ganar_espacio",
    "cambiar_ubicacion",
    "reorganizar_lineal",
    "otra",
  ]),
});

const reorganizacion = z.object({
  ...comunes,
  tipoSituacion: z.literal("reorganizacion"),
  propuesta: z.string().min(1).max(4000),
});

const extraespacio = z.object({
  ...comunes,
  tipoSituacion: z.literal("extraespacio"),
  tipo: z.enum(["cabecera", "isla", "pila", "otro"]),
  motivo: z.enum([
    "alta_rotacion",
    "promocion",
    "potencial_venta",
    "falta_espacio_lineal",
    "oportunidad_estacional",
    "otro",
  ]),
});

const nevera = z.object({
  ...comunes,
  tipoSituacion: z.literal("nevera"),
  motivo: z.enum([
    "alta_rotacion",
    "promocion",
    "potencial_venta",
    "falta_espacio_lineal",
    "oportunidad_estacional",
    "otro",
  ]),
  situacion: z.enum([
    "uso_correcto",
    "uso_parcial",
    "uso_incorrecto",
    "retirada",
    "vacia_desaprovechada",
    "necesita_nueva",
    "necesita_recogida",
    "otro",
  ]),
  /**
   * Obligatorio cuando hay que mover una unidad concreta. Es la clave con la
   * que el FSM informa en su aplicación de neveras, y existe para que no se
   * retire la equivocada.
   */
  codigoNevera: z.string().max(64).optional(),
});

/** Situaciones de nevera en las que hace falta identificar la unidad física. */
const NEVERA_EXIGE_CODIGO = ["retirada", "necesita_recogida"] as const;

export const registrarAccionSchema = z
  .discriminatedUnion("tipoSituacion", [
    stock,
    fechas,
    hueco,
    topPico,
    facings,
    visibilidad,
    reorganizacion,
    extraespacio,
    nevera,
  ])
  .superRefine((dto, ctx) => {
    const { tipoSituacion: tipo, categoriaProducto: categoria } = dto;

    // La comprobación de fechas es exclusiva de Dairy: pedirla en Waters sería
    // pedir que se revisen caducidades de agua embotellada.
    if (!situacionDisponible(tipo, categoria)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tipoSituacion"],
        message: `La situación "${tipo}" no aplica a la categoría "${categoria}"`,
      });
    }

    if (dto.tipoSituacion === "stock") {
      // "El reponedor todavía no ha pasado" solo existe donde hay reponedor.
      // Aceptarlo en Waters sería aceptar una excusa que no existe, y ensuciaría
      // justo el dato en que el boceto quiere apoyarse.
      if (!opcionesSuficienciaStock(categoria).includes(dto.suficiencia)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["suficiencia"],
          message: `"${dto.suficiencia}" no es una respuesta válida en "${categoria}"`,
        });
      }
      if (categoria === "dairy" && dto.comunicadoAlResponsable !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["comunicadoAlResponsable"],
          message: "En Dairy la incidencia escala al FSM: no se comunica en tienda",
        });
      }
    }

    if (dto.tipoSituacion === "fechas" && dto.problema === "otro" && !dto.detalle?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["detalle"],
        message: 'Indica cuál es el problema cuando eliges "otro"',
      });
    }

    if (dto.tipoSituacion === "hueco") {
      // En Dairy se pregunta si el reponedor lo cubrió; en Waters/PBB, si lo
      // corrigió el propio GPV. Son dos preguntas distintas, no la misma.
      if (categoria === "dairy" && dto.correccion !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correccion"],
          message: "En Dairy el GPV no corrige el hueco: lo cubre el reponedor",
        });
      }
      if (categoria !== "dairy" && dto.cubiertoConAdyacente !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cubiertoConAdyacente"],
          message: "Fuera de Dairy no hay reponedor que cubra el hueco",
        });
      }
    }

    if (dto.tipoSituacion === "facings" && dto.conseguido && dto.facingsGanados < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facingsGanados"],
        message: "Si se consiguió espacio, indica cuántos facings se ganaron",
      });
    }

    if (
      dto.tipoSituacion === "nevera" &&
      NEVERA_EXIGE_CODIGO.includes(dto.situacion as (typeof NEVERA_EXIGE_CODIGO)[number]) &&
      !dto.codigoNevera?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["codigoNevera"],
        message: "Hace falta el código de la nevera para que no se retire otra",
      });
    }
  });

export type RegistrarAccionDto = z.infer<typeof registrarAccionSchema>;

/** Pronunciarse sobre una acción abierta en una visita posterior. */
export const comprobarSchema = z.object({
  desenlace: z.enum(["sigue_pendiente", "resuelta", "no_procede"]),
  comentario: z.string().max(4000).optional(),
  /** La visita desde la que se comprueba. El FSM comprueba sin visita. */
  visitaId: z.string().uuid().optional(),
  comprobadaEn: z.coerce.date().optional(),
  idCliente: z.string().min(1).max(128).optional(),
});
export type ComprobarDto = z.infer<typeof comprobarSchema>;

/** Cierre o cambio de estado desde el panel del FSM. */
export const cambiarEstadoAccionSchema = z.object({
  estado: z.enum(["abierta", "en_curso", "resuelta", "descartada"]),
  notaResultado: z.string().max(4000).optional(),
});
export type CambiarEstadoAccionDto = z.infer<typeof cambiarEstadoAccionSchema>;

/** Bandeja de acciones pendientes del FSM. */
export const bandejaAccionesSchema = z.object({
  estado: z.enum(["abierta", "en_curso", "resuelta", "descartada"]).optional(),
  categoriaProducto: categoriaProducto.optional(),
  tipoSituacion: z.string().optional(),
  responsableActuar: z.enum(["gpv", "fsm"]).optional(),
  tiendaId: z.string().uuid().optional(),
  /** Solo las que superan el umbral de antigüedad. */
  soloEstancadas: z.coerce.boolean().optional(),
  /** Solo las que el FSM tenía asignadas y cerró un GPV. */
  cerradasPorGpv: z.coerce.boolean().optional(),
  limite: z.coerce.number().int().positive().max(200).default(50),
});
export type BandejaAccionesDto = z.infer<typeof bandejaAccionesSchema>;

/**
 * Relación con el responsable de tienda (SPECS §5.6).
 *
 * La valoración representa la relación **general**, no cómo fue la conversación
 * de ese día. El enunciado de la interfaz debe dejarlo claro.
 */
export const relacionResponsableSchema = z
  .object({
    haHablado: z.boolean(),
    valoracion: z
      .enum(["muy_buena", "buena", "correcta", "mejorable", "mala", "no_ha_podido_hablar"])
      .optional(),
    cuestionPendiente: z.boolean().default(false),
    comentario: z.string().max(4000).optional(),
    idCliente: z.string().min(1).max(128).optional(),
  })
  .superRefine((dto, ctx) => {
    if (dto.haHablado && !dto.valoracion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valoracion"],
        message: "Si ha hablado con el responsable, falta la valoración",
      });
    }
    if (dto.cuestionPendiente && !dto.comentario?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comentario"],
        message: "Describe la cuestión pendiente",
      });
    }
  });
export type RelacionResponsableDto = z.infer<typeof relacionResponsableSchema>;

/** Filtro de los catálogos de marcas y referencias. */
export const catalogoSchema = z.object({
  categoria: categoriaProducto.optional(),
});
export type CatalogoDto = z.infer<typeof catalogoSchema>;
