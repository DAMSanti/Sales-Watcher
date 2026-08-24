import { SetMetadata } from "@nestjs/common";

export const PERMITE_PASSWORD_PENDIENTE = "permite_password_pendiente";

/**
 * Permite acceder al endpoint aunque el usuario tenga un cambio de contraseña
 * pendiente. Reservado al propio cambio y a la consulta de perfil: cualquier
 * otro uso abre un agujero en el forzado.
 */
export const PermitePasswordPendiente = () =>
  SetMetadata(PERMITE_PASSWORD_PENDIENTE, true);
