import { IDIOMAS } from "@sw/shared";
import { z } from "zod";

/**
 * Texto traducible tal y como lo envía el editor del backoffice.
 *
 * Todos los idiomas son opcionales en el esquema; la exigencia de que exista
 * al menos el castellano se aplica en el servicio, con un mensaje que explica
 * por qué. Obligar aquí a los cinco bloquearía al administrador que necesita
 * dar de alta una categoría hoy porque el cliente la pidió esta mañana.
 */
export const textoI18nSchema = z
  .object(
    Object.fromEntries(
      IDIOMAS.map((i) => [i, z.string().trim().max(500).optional()]),
    ) as Record<(typeof IDIOMAS)[number], z.ZodOptional<z.ZodString>>,
  )
  .refine((t) => Object.values(t).some((v) => v && v.trim() !== ""), {
    message: "El texto debe tener contenido en al menos un idioma",
  });

/** Clave estable: minúsculas, dígitos y guion bajo. Nunca cambia. */
const codigo = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^[a-z0-9_]+$/,
    "El código solo admite minúsculas, dígitos y guion bajo",
  );

export const categoriaSchema = z.object({
  codigo,
  nombre: textoI18nSchema,
  tipo: z.enum(["incidencia", "oportunidad"]),
  prioridadDefecto: z.enum(["baja", "media", "alta", "critica"]).default("media"),
  orden: z.number().int().min(0).default(0),
});
export type CategoriaDto = z.infer<typeof categoriaSchema>;

export const motivoSchema = z.object({
  codigo,
  texto: textoI18nSchema,
  requiereComentario: z.boolean().default(false),
  orden: z.number().int().min(0).default(0),
});
export type MotivoDto = z.infer<typeof motivoSchema>;

export const tipoTiendaSchema = z.object({
  codigo,
  nombre: textoI18nSchema,
});
export type TipoTiendaDto = z.infer<typeof tipoTiendaSchema>;

export const zonaSchema = z.object({
  codigo,
  nombre: textoI18nSchema,
  region: z.string().trim().max(120).optional(),
  /**
   * Zona horaria IANA. Determina cuándo cierra la jornada en esta zona, así
   * que un valor inválido dejaría a sus comerciales sin cierre automático.
   */
  zonaHoraria: z
    .string()
    .trim()
    .default("Europe/Madrid")
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Zona horaria IANA no reconocida (ej. Europe/Madrid)" },
    ),
});
export type ZonaDto = z.infer<typeof zonaSchema>;

export const activoSchema = z.object({ activo: z.boolean() });
export type ActivoDto = z.infer<typeof activoSchema>;
