import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { usuarios } from "@sw/db";
import { SERVICIO_DB, type ClienteDb } from "../../db/db.module";
import { ES_PUBLICO } from "../decoradores/publico.decorator";
import type { PayloadToken } from "../auth.service";

declare module "express" {
  interface Request {
    usuario?: PayloadToken;
  }
}

/**
 * Verifica el token y comprueba que la sesión sigue siendo válida.
 *
 * Es guard global: todo endpoint exige autenticación salvo los marcados con
 * `@Publico()`. El defecto seguro importa — si hubiera que acordarse de
 * proteger cada ruta, tarde o temprano se olvidaría una.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) return true;

    const peticion = contexto.switchToHttp().getRequest<Request>();
    const token = extraerToken(peticion);
    if (!token) throw new UnauthorizedException("Falta el token de sesión");

    let payload: PayloadToken;
    try {
      payload = await this.jwt.verifyAsync<PayloadToken>(token);
    } catch {
      throw new UnauthorizedException("Sesión inválida o caducada");
    }

    /**
     * Comprobación contra base de datos en cada petición.
     *
     * Un JWT es autocontenido y eso es justo el problema con tokens de 30 días:
     * sin mirar la base de datos, un usuario dado de baja seguiría entrando un
     * mes entero. Aquí se verifican tres cosas que el token no puede saber por
     * sí mismo: que sigue activo, que no está bloqueado, y que la contraseña no
     * ha cambiado desde que se emitió el token.
     */
    const [usuario] = await this.db
      .select({
        activo: usuarios.activo,
        bloqueadoHasta: usuarios.bloqueadoHasta,
        passwordCambiadoEn: usuarios.passwordCambiadoEn,
        requiereCambioPassword: usuarios.requiereCambioPassword,
        rol: usuarios.rol,
        zonaId: usuarios.zonaId,
        idioma: usuarios.idiomaPreferido,
      })
      .from(usuarios)
      .where(eq(usuarios.id, payload.sub))
      .limit(1);

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException("La cuenta ya no está activa");
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      throw new UnauthorizedException("Cuenta bloqueada temporalmente");
    }

    // `iat` viene en segundos; el margen de un segundo evita rechazar el token
    // que se acaba de emitir en el mismo instante del cambio de contraseña.
    const emitidoEn = (payload.iat ?? 0) * 1000;
    if (emitidoEn + 1000 < usuario.passwordCambiadoEn.getTime()) {
      throw new UnauthorizedException(
        "La contraseña ha cambiado. Vuelve a iniciar sesión.",
      );
    }

    /**
     * El rol y el forzado de cambio se toman de base de datos, no del token:
     * si un administrador degrada a un usuario o le regenera la contraseña, el
     * cambio surte efecto en la siguiente petición y no dentro de 30 días.
     */
    peticion.usuario = {
      ...payload,
      rol: usuario.rol,
      zonaId: usuario.zonaId,
      idioma: usuario.idioma,
      requiereCambioPassword: usuario.requiereCambioPassword,
    };

    return true;
  }
}

function extraerToken(peticion: Request): string | null {
  const cabecera = peticion.headers.authorization;
  if (!cabecera) return null;
  const [tipo, valor] = cabecera.split(" ");
  return tipo === "Bearer" && valor ? valor : null;
}
