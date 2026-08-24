import { z } from "zod";

/**
 * Esquemas de validación de autenticación.
 *
 * La longitud mínima de la contraseña nueva se fija aquí en 10. Es más que el
 * mínimo habitual de 8 porque estas cuentas viven 30 días sin reautenticar y
 * dan acceso a datos de geolocalización de trabajadores.
 *
 * No se exigen mayúsculas, dígitos ni símbolos a propósito: esas reglas
 * empujan a `Verano2026!` y a apuntar la contraseña en un papel, que es peor
 * que una frase larga y memorable. La longitud es la defensa que sí funciona.
 */

export const loginSchema = z.object({
  numeroTrabajador: z
    .string()
    .trim()
    .min(1, "El número de trabajador es obligatorio")
    .max(32),
  password: z.string().min(1, "La contraseña es obligatoria").max(256),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const cambiarPasswordSchema = z
  .object({
    passwordActual: z.string().min(1, "La contraseña actual es obligatoria"),
    passwordNueva: z
      .string()
      .min(10, "La nueva contraseña debe tener al menos 10 caracteres")
      .max(256),
  })
  .refine((d) => d.passwordActual !== d.passwordNueva, {
    message: "La nueva contraseña debe ser distinta de la actual",
    path: ["passwordNueva"],
  });

export type CambiarPasswordDto = z.infer<typeof cambiarPasswordSchema>;

export const regenerarPasswordSchema = z.object({
  usuarioId: z.string().uuid("Identificador de usuario inválido"),
});

export type RegenerarPasswordDto = z.infer<typeof regenerarPasswordSchema>;
