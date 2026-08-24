import { z } from "zod";

export const marcarItemSchema = z.object({
  completado: z.boolean(),
  /**
   * Momento en el dispositivo. Con modo offline, el comercial pudo marcar el
   * ítem dentro de la tienda y sincronizar una hora después; lo que documenta
   * la visita es cuándo lo hizo, no cuándo llegó el dato.
   */
  capturadaEn: z.coerce.date().optional(),
});
export type MarcarItemDto = z.infer<typeof marcarItemSchema>;
