import { z } from "zod";
import { textoI18nSchema } from "../../catalogos/dto/catalogos.dto";

export const plantillaSchema = z.object({
  nombre: textoI18nSchema,
  /** Null = plantilla global, aplicable a cualquier tipo de tienda. */
  tipoTiendaId: z.string().uuid().nullable().optional(),
});
export type PlantillaDto = z.infer<typeof plantillaSchema>;

export const itemSchema = z.object({
  texto: textoI18nSchema,
  /** Si es true, el ítem no se puede marcar sin una foto confirmada. */
  requiereFoto: z.boolean().default(false),
  /** Si queda sin completar, la visita se marca incompleta al finalizar. */
  obligatorio: z.boolean().default(false),
  orden: z.number().int().min(0).default(0),
});
export type ItemDto = z.infer<typeof itemSchema>;

export const reordenarSchema = z.object({
  /** Identificadores de ítem en el orden deseado. */
  items: z.array(z.string().uuid()).min(1),
});
export type ReordenarDto = z.infer<typeof reordenarSchema>;
