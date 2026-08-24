import { z } from "zod";

export const tiendaSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  /**
   * Dato de negocio visible, NO clave primaria. Cuando llegue el ERP la
   * correspondencia se hará por `idExterno`; atar el histórico de visitas a
   * este número, que el ERP puede cambiar, rompería el histórico.
   */
  numeroReferencia: z.string().trim().min(1).max(64),
  direccion: z.string().trim().max(300).optional(),
  localidad: z.string().trim().max(120).optional(),
  codigoPostal: z.string().trim().max(10).optional(),
  zonaId: z.string().uuid().optional(),
  tipoTiendaId: z.string().uuid().optional(),
  ubicacion: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      /** Cero en fichas: es ubicación oficial, no lectura de dispositivo. */
      precisionM: z.number().nonnegative().default(0),
      capturadoEn: z.string().datetime().default(() => new Date().toISOString()),
    })
    .optional(),
  activo: z.boolean().optional(),
});
export type TiendaDto = z.infer<typeof tiendaSchema>;

export const buscarTiendasSchema = z.object({
  texto: z.string().trim().min(1).max(120).optional(),
  zonaId: z.string().uuid().optional(),
  tipoTiendaId: z.string().uuid().optional(),
  /** El comercial solo debe ver activas; el administrador, todas. */
  incluirInactivas: z.coerce.boolean().default(false),
  limite: z.coerce.number().int().positive().max(200).default(50),
  desplazamiento: z.coerce.number().int().min(0).default(0),
});
export type BuscarTiendasDto = z.infer<typeof buscarTiendasSchema>;

export const importarCsvSchema = z.object({
  /**
   * Contenido del fichero como texto.
   *
   * Se recibe en el cuerpo en lugar de como multipart porque un CSV de tiendas
   * son unos cientos de kilobytes de texto plano y evita una dependencia de
   * subida de ficheros para un caso de uso puntual del backoffice.
   */
  contenido: z.string().min(1).max(5_000_000),
});
export type ImportarCsvDto = z.infer<typeof importarCsvSchema>;
