import { MAX_OPERACIONES_LOTE } from "@sw/shared";
import { z } from "zod";

const puntoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  precisionM: z.number().nonnegative(),
  capturadoEn: z.string().datetime(),
});

/**
 * Referencia a una visita: por identificador de servidor o por el del
 * dispositivo.
 *
 * Exige al menos uno. Una operación que no apunta a ninguna visita no es
 * ambigua, es inaplicable, y conviene rechazarla en la validación en lugar de
 * dejar que falle a medio camino.
 */
const refVisitaSchema = z
  .object({
    id: z.string().uuid().optional(),
    idCliente: z.string().min(1).max(128).optional(),
  })
  .refine((r) => r.id !== undefined || r.idCliente !== undefined, {
    message: "La operación debe referenciar la visita por id o por idCliente",
  });

const idCliente = z.string().min(1).max(128).optional();

/**
 * Identificador de la ENTRADA DE COLA, distinto del `idCliente` de entidad.
 *
 * Obligatorio en todas las operaciones: es lo que permite reconocer un
 * reintento del lote completo cuando la respuesta anterior se perdió. Sin él,
 * reintentar una transición de estado devolvería un conflicto por algo que ya
 * se había aplicado con éxito.
 */
const opId = z.string().min(1).max(128);

/**
 * Unión discriminada por `tipo`.
 *
 * Es lo que permite que el `switch` del servicio sea exhaustivo y que
 * TypeScript avise si se añade un tipo de operación y se olvida implementarlo.
 */
export const operacionSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("visita.crear"),
    opId,
    tiendaId: z.string().uuid(),
    idCliente,
  }),
  z.object({
    tipo: z.literal("visita.comenzar"),
    opId,
    visita: refVisitaSchema,
    ubicacion: puntoSchema.optional(),
    capturadaEn: z.coerce.date().optional(),
  }),
  z.object({
    tipo: z.literal("visita.finalizar"),
    opId,
    visita: refVisitaSchema,
    ubicacion: puntoSchema.optional(),
    capturadaEn: z.coerce.date().optional(),
    notasLibres: z.string().max(4000).optional(),
  }),
  z.object({
    tipo: z.literal("visita.justificar"),
    opId,
    visita: refVisitaSchema,
    motivoId: z.string().uuid(),
    comentario: z.string().max(2000).optional(),
    /** Obligatoria: es la que valida la ventana diaria. */
    capturadaEn: z.coerce.date(),
    idCliente,
  }),
  z.object({
    tipo: z.literal("checklist.marcar"),
    opId,
    visita: refVisitaSchema,
    itemId: z.string().uuid(),
    completado: z.boolean(),
    capturadaEn: z.coerce.date().optional(),
  }),
  z.object({
    tipo: z.literal("incidencia.crear"),
    opId,
    visita: refVisitaSchema,
    categoriaId: z.string().uuid(),
    descripcion: z.string().max(4000).optional(),
    prioridad: z.enum(["baja", "media", "alta", "critica"]).optional(),
    idCliente,
  }),
  z.object({
    tipo: z.literal("foto.reservar"),
    opId,
    visita: refVisitaSchema,
    ambito: z.enum(["visita", "checklist", "incidencia"]),
    resultadoChecklistId: z.string().uuid().optional(),
    incidenciaId: z.string().uuid().optional(),
    /** Para una incidencia creada en este mismo lote. */
    incidenciaIdCliente: z.string().min(1).max(128).optional(),
    tipoMime: z.string().min(1),
    tamanoBytes: z.number().int().positive(),
    capturadaEn: z.coerce.date(),
    ubicacion: puntoSchema.optional(),
    idCliente,
  }),
  z.object({
    tipo: z.literal("foto.confirmar"),
    opId,
    fotoId: z.string().uuid().optional(),
    /** Para una foto reservada en este mismo lote. */
    fotoIdCliente: z.string().min(1).max(128).optional(),
  }),
]);

export type OperacionDto = z.infer<typeof operacionSchema>;

export const loteSchema = z.object({
  /**
   * Las operaciones se aplican EN ORDEN. El cliente debe enviarlas en el mismo
   * en que ocurrieron: comenzar antes que finalizar, crear antes que marcar.
   */
  operaciones: z
    .array(operacionSchema)
    .min(1, "El lote no puede estar vacío")
    .max(
      MAX_OPERACIONES_LOTE,
      `Un lote no puede superar las ${MAX_OPERACIONES_LOTE} operaciones`,
    ),
});

export type LoteDto = z.infer<typeof loteSchema>;
