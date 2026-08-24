import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ROLES_REQUERIDOS, type Rol } from "../decoradores/roles.decorator";

/**
 * Control de acceso por rol (SPECS §3).
 *
 * Sin `@Roles()` en el endpoint, basta con estar autenticado. La jerarquía no
 * es automática: un administrador NO hereda los permisos de comercial. Es
 * deliberado — las acciones de campo (comenzar visita, justificar) pertenecen
 * a quien pisa la tienda, y que un administrador pudiera ejecutarlas
 * contaminaría el registro de actividad, que es justamente lo que este sistema
 * existe para documentar. Cuando un endpoint deba servir a varios roles, se
 * enumeran todos.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES_REQUERIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (!requeridos || requeridos.length === 0) return true;

    const peticion = contexto.switchToHttp().getRequest<Request>();
    const usuario = peticion.usuario;

    if (!usuario || !requeridos.includes(usuario.rol)) {
      throw new ForbiddenException("No tienes permiso para esta operación");
    }

    return true;
  }
}
