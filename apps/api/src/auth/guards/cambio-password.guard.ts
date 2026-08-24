import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PERMITE_PASSWORD_PENDIENTE } from "../decoradores/permite-password-pendiente.decorator";

/**
 * Bloquea toda la API mientras el usuario tenga un cambio de contraseña
 * pendiente.
 *
 * Es la mitad que se olvida del forzado de cambio. Comprobarlo solo en el
 * login no sirve de nada: el usuario recibe un token válido y puede ignorar la
 * pantalla de cambio, llamando directamente a cualquier endpoint con una
 * contraseña temporal que un tercero conoce y que probablemente viajó por
 * WhatsApp (ANEXO, decisión que cierra P8).
 *
 * Solo los endpoints marcados con `@PermitePasswordPendiente()` quedan fuera:
 * el propio cambio de contraseña y la consulta del perfil, que la PWA necesita
 * para pintar la pantalla.
 */
@Injectable()
export class CambioPasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permitido = this.reflector.getAllAndOverride<boolean>(
      PERMITE_PASSWORD_PENDIENTE,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (permitido) return true;

    const peticion = contexto.switchToHttp().getRequest<Request>();
    const usuario = peticion.usuario;

    // Sin usuario en la petición, el endpoint es público: no hay nada que exigir.
    if (!usuario) return true;

    if (usuario.requiereCambioPassword) {
      throw new ForbiddenException(
        "Debes cambiar tu contraseña antes de continuar",
      );
    }

    return true;
  }
}
