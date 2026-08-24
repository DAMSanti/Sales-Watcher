import { z } from "zod";

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD");

export const planificarSchema = z.object({
  usuarioId: z.string().uuid(),
  fecha,
  /**
   * Tiendas en el orden sugerido de visita. El orden es orientativo: no hay
   * franjas horarias y el comercial organiza su jornada como quiera.
   */
  tiendaIds: z.array(z.string().uuid()).max(50),
});
export type PlanificarDto = z.infer<typeof planificarSchema>;

export const consultarRutaSchema = z.object({
  usuarioId: z.string().uuid().optional(),
  fecha,
});
export type ConsultarRutaDto = z.infer<typeof consultarRutaSchema>;
