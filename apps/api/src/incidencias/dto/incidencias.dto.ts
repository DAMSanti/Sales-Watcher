import { z } from "zod";

export const crearIncidenciaSchema = z.object({
  categoriaId: z.string().uuid(),
  descripcion: z.string().max(4000).optional(),
  /** Si se omite, se toma la prioridad por defecto de la categoría. */
  prioridad: z.enum(["baja", "media", "alta", "critica"]).optional(),
  idCliente: z.string().min(1).max(128).optional(),
});
export type CrearIncidenciaDto = z.infer<typeof crearIncidenciaSchema>;

export const cambiarEstadoSchema = z.object({
  estado: z.enum(["abierta", "en_revision", "resuelta", "descartada"]),
  asignadoA: z.string().uuid().optional(),
  notaResolucion: z.string().max(4000).optional(),
});
export type CambiarEstadoDto = z.infer<typeof cambiarEstadoSchema>;

export const bandejaSchema = z.object({
  estado: z.enum(["abierta", "en_revision", "resuelta", "descartada"]).optional(),
  prioridad: z.enum(["baja", "media", "alta", "critica"]).optional(),
  tipo: z.enum(["incidencia", "oportunidad"]).optional(),
  limite: z.coerce.number().int().positive().max(200).default(50),
});
export type BandejaDto = z.infer<typeof bandejaSchema>;

export const categoriasSchema = z.object({
  tipo: z.enum(["incidencia", "oportunidad"]).optional(),
});
export type CategoriasDto = z.infer<typeof categoriasSchema>;
