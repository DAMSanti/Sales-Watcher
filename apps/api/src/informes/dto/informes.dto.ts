import { z } from "zod";

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD");

/** Por defecto, los últimos 30 días: el periodo que mira un supervisor. */
function hace(dias: number) {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}
function hoy() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Base reutilizable. Se declara aparte del esquema final porque `transform`
 * devuelve un ZodEffects, sobre el que ya no se puede extender.
 */
const filtrosBase = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  zonaId: z.string().uuid().optional(),
  usuarioId: z.string().uuid().optional(),
  tiendaId: z.string().uuid().optional(),
});

const rellenarFechas = <T extends { desde?: string; hasta?: string }>(f: T) => ({
  ...f,
  desde: f.desde ?? hace(30),
  hasta: f.hasta ?? hoy(),
});

export const filtrosSchema = filtrosBase
  .transform((f) => ({
    ...f,
    desde: f.desde ?? hace(30),
    hasta: f.hasta ?? hoy(),
  }))
  /**
   * Un rango invertido no devuelve error de base de datos: devuelve cero
   * filas, y un informe vacío se interpreta como "no hubo actividad" en lugar
   * de como un filtro mal puesto.
   */
  .refine((f) => f.desde <= f.hasta, {
    message: "La fecha inicial no puede ser posterior a la final",
    path: ["desde"],
  });

export type FiltrosDto = z.infer<typeof filtrosSchema>;

export const dashboardSchema = z.object({
  fecha: fecha.optional().transform((f) => f ?? hoy()),
});
export type DashboardDto = z.infer<typeof dashboardSchema>;

export const bandejaJustificacionesSchema = filtrosBase
  .extend({ soloPendientes: z.coerce.boolean().default(true) })
  .transform(rellenarFechas);
export type BandejaJustificacionesDto = z.infer<typeof bandejaJustificacionesSchema>;
