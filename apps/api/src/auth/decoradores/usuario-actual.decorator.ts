import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { PayloadToken } from "../auth.service";

/**
 * Inyecta el usuario autenticado en el parámetro del controlador.
 * Lo rellena `JwtAuthGuard` tras validar el token contra base de datos.
 */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): PayloadToken => {
    const peticion = contexto.switchToHttp().getRequest<Request>();
    return peticion.usuario!;
  },
);
