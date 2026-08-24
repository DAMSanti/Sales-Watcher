import { z } from "zod";

const puntoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  precisionM: z.number().nonnegative(),
  capturadoEn: z.string().datetime(),
});

/**
 * Marca de tiempo capturada en el DISPOSITIVO.
 *
 * Todas las operaciones que la aceptan la usan en lugar de la hora del
 * servidor: con modo offline pueden separarse horas, y lo que documenta la
 * visita es cuándo ocurrió, no cuándo llegó el dato.
 */
const capturadaEn = z.coerce.date().optional();

export const comenzarVisitaSchema = z.object({
  ubicacion: puntoSchema.optional(),
  capturadaEn,
});
export type ComenzarVisitaDto = z.infer<typeof comenzarVisitaSchema>;

export const finalizarVisitaSchema = z.object({
  ubicacion: puntoSchema.optional(),
  capturadaEn,
  notasLibres: z.string().max(4000).optional(),
});
export type FinalizarVisitaDto = z.infer<typeof finalizarVisitaSchema>;

export const crearVisitaSchema = z.object({
  tiendaId: z.string().uuid(),
  idCliente: z.string().min(1).max(128).optional(),
});
export type CrearVisitaDto = z.infer<typeof crearVisitaSchema>;

export const justificarSchema = z.object({
  motivoId: z.string().uuid(),
  comentario: z.string().max(2000).optional(),
  /**
   * Obligatoria, a diferencia del resto de operaciones: es la que valida la
   * ventana diaria, y dejar que el servidor la rellene con su propia hora
   * rompería justamente la garantía de que una justificación hecha a tiempo
   * sin cobertura se acepta al sincronizar más tarde.
   */
  capturadaEn: z.coerce.date(),
  idCliente: z.string().min(1).max(128).optional(),
});
export type JustificarDto = z.infer<typeof justificarSchema>;

export const vistaDelDiaSchema = z.object({
  /** Formato `YYYY-MM-DD`. Por defecto, hoy en la zona del comercial. */
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD")
    .optional(),
});
export type VistaDelDiaDto = z.infer<typeof vistaDelDiaSchema>;
