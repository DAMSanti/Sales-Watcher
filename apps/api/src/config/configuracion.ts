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
  PORT: z.coerce.number().int().positive().default(3000),

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
