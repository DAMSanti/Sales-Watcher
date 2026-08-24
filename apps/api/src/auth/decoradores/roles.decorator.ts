import { SetMetadata } from "@nestjs/common";

export type Rol = "comercial" | "supervisor" | "administrador";

export const ROLES_REQUERIDOS = "roles_requeridos";

/**
 * Restringe un endpoint a los roles indicados.
 * No hay herencia: si un endpoint debe servir a supervisores y
 * administradores, se enumeran los dos.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_REQUERIDOS, roles);
