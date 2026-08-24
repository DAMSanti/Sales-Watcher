import { z } from "zod";

/** Punto capturado por la API de geolocalización del navegador. */
const puntoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Radio de incertidumbre en metros; sin él la desviación no es interpretable. */
  precisionM: z.number().nonnegative(),
  capturadoEn: z.string().datetime(),
});

export const solicitarSubidaSchema = z
  .object({
    visitaId: z.string().uuid(),
    ambito: z.enum(["visita", "checklist", "incidencia"]),
    resultadoChecklistId: z.string().uuid().optional(),
    incidenciaId: z.string().uuid().optional(),
    tipoMime: z.string().min(1),
    tamanoBytes: z.number().int().positive(),
    /**
     * Dimensiones tras comprimir en el dispositivo.
     *
     * Permiten al backoffice reservar el hueco de la imagen antes de
     * descargarla, sin saltos de maquetado al cargar una galería de visita.
     */
    anchoPx: z.number().int().positive().optional(),
    altoPx: z.number().int().positive().optional(),
    /**
     * Momento de la captura en el dispositivo, no de la subida. Con modo
     * offline pueden separarse horas, y es la captura lo que documenta cuándo
     * ocurrió la visita.
     */
    capturadaEn: z.coerce.date(),
    ubicacion: puntoSchema.optional(),
    /** Identificador generado en el dispositivo antes de encolar. */
    idCliente: z.string().min(1).max(128).optional(),
  })
  /**
   * El ámbito y la referencia tienen que cuadrar. Sin esta comprobación se
   * podría guardar una foto de ámbito "incidencia" sin incidencia asociada,
   * y quedaría colgada sin aparecer en ninguna pantalla.
   */
  .refine(
    (d) => d.ambito !== "checklist" || d.resultadoChecklistId !== undefined,
    {
      message: "Una foto de ámbito checklist necesita resultadoChecklistId",
      path: ["resultadoChecklistId"],
    },
  )
  .refine((d) => d.ambito !== "incidencia" || d.incidenciaId !== undefined, {
    message: "Una foto de ámbito incidencia necesita incidenciaId",
    path: ["incidenciaId"],
  });

export type SolicitarSubidaDto = z.infer<typeof solicitarSubidaSchema>;
