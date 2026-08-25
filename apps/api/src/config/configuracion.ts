import { z } from "zod";

/**
 * Configuración de la API, validada al arrancar.
 *
 * Se valida con Zod y el proceso NO arranca si algo falta o es inválido. Es
 * deliberado: una API que arranca con un JWT_SECRET vacío y falla en la
 * primera petición es mucho peor que una que se niega a levantar.
 */

const esquema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3900),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  /**
   * Hora local de cierre de jornada. Cierra la ventana de justificación y
   * convierte las visitas pendientes en no realizadas (SPECS §5.5).
   */
  CIERRE_JORNADA_HORA: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "CIERRE_JORNADA_HORA debe tener formato HH:mm")
    .default("21:00"),
  ZONA_HORARIA_DEFECTO: z.string().default("Europe/Madrid"),

  /** Vacío = conservar indefinidamente, pero el mecanismo de purga ya existe. */
  RETENCION_FOTOS_DIAS: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? Number(v) : null)),

  // ── Política de bloqueo por intentos fallidos (SPECS §5.1) ──────────
  /**
   * Intentos antes de bloquear. Cinco es el equilibrio habitual: suficiente
   * para quien se equivoca tecleando en un móvil con una mano en la tienda,
   * y demasiado poco para fuerza bruta.
   */
  AUTH_MAX_INTENTOS: z.coerce.number().int().positive().default(5),
  /**
   * Minutos de bloqueo. Es temporal a propósito: un bloqueo permanente
   * obligaría a llamar al backoffice desde la calle y dejaría al comercial
   * sin poder trabajar el resto del día.
   */
  AUTH_BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),
  /** Longitud mínima de contraseña al cambiarla. */
  AUTH_PASSWORD_MIN: z.coerce.number().int().min(8).default(10),

  /**
   * Días tras los que una acción abierta se marca como **estancada**.
   *
   * Estancada no la cierra: solo la sube en el panel del FSM. Las acciones no
   * caducan, porque cerrarlas solas destruiría en silencio el seguimiento que
   * da sentido al sistema (ANEXO, decisión que cierra P23).
   *
   * Catorce días son unos dos ciclos de visita: suficiente para que el GPV haya
   * vuelto al menos una vez y siga sin resolverse.
   */
  ACCION_ESTANCADA_DIAS: z.coerce.number().int().positive().default(14),

  // ── Almacenamiento de fotografías ──────────────────────────────────
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),

  /**
   * Tamaño máximo por fotografía. 5 MB es holgado para una imagen ya
   * comprimida y redimensionada en el dispositivo; si llega algo mayor,
   * significa que la compresión del cliente falló y conviene rechazarlo antes
   * de que cientos de visitas al día llenen el almacenamiento.
   */
  FOTO_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  /**
   * Validez de la URL firmada de subida. Corta, pero suficiente para que el
   * dispositivo termine de subir por una red móvil lenta.
   */
  URL_SUBIDA_MINUTOS: z.coerce.number().int().positive().default(15),

  /**
   * Validez de la URL firmada de descarga. Muy corta: se genera al vuelo cada
   * vez que el backoffice pinta una foto, y una URL larga que se filtre da
   * acceso a la imagen sin pasar por la autenticación.
   */
  URL_DESCARGA_MINUTOS: z.coerce.number().int().positive().default(5),

  /**
   * Horas tras las que una reserva de subida sin confirmar se considera
   * abandonada y se limpia. Generoso a propósito: el comercial puede quedarse
   * sin cobertura y no completar la subida hasta el día siguiente.
   */
  FOTO_RESERVA_CADUCA_HORAS: z.coerce.number().int().positive().default(48),
});

export type Configuracion = z.infer<typeof esquema>;

export function cargarConfiguracion(): Configuracion {
  const resultado = esquema.safeParse(process.env);

  if (!resultado.success) {
    const detalles = resultado.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración inválida:\n${detalles}`);
  }

  const config = resultado.data;

  if (
    config.NODE_ENV === "production" &&
    config.JWT_SECRET.includes("cambiar_esto")
  ) {
    throw new Error(
      "JWT_SECRET sigue con el valor de ejemplo. Genera un secreto real antes de desplegar.",
    );
  }

  return config;
}
