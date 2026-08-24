import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { contextoDe } from "../comun/contexto-peticion";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { AuthService, type PayloadToken } from "./auth.service";
import { PermitePasswordPendiente } from "./decoradores/permite-password-pendiente.decorator";
import { Publico } from "./decoradores/publico.decorator";
import { Roles } from "./decoradores/roles.decorator";
import { UsuarioActual } from "./decoradores/usuario-actual.decorator";
import {
  cambiarPasswordSchema,
  loginSchema,
  regenerarPasswordSchema,
  type CambiarPasswordDto,
  type LoginDto,
  type RegenerarPasswordDto,
} from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Inicio de sesión con número de trabajador y contraseña.
   *
   * Lleva un límite de peticiones más estricto que el resto de la API. El
   * bloqueo por intentos fallidos protege una cuenta concreta, pero no impide
   * probar una contraseña común contra cientos de números de trabajador
   * distintos, que son correlativos y por tanto fáciles de enumerar. El
   * throttle por IP es lo que cubre ese hueco.
   */
  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto, @Req() peticion: Request) {
    return this.auth.login(dto.numeroTrabajador, dto.password, contextoDe(peticion));
  }

  /**
   * Perfil del usuario autenticado.
   *
   * Accesible con cambio de contraseña pendiente porque la PWA lo necesita
   * para pintar la pantalla de cambio con el nombre del usuario.
   */
  @PermitePasswordPendiente()
  @Get("yo")
  async yo(@UsuarioActual() usuario: PayloadToken) {
    return {
      id: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      rol: usuario.rol,
      zonaId: usuario.zonaId,
      idioma: usuario.idioma,
      requiereCambioPassword: usuario.requiereCambioPassword,
    };
  }

  /**
   * Cambio de contraseña por el propio usuario.
   *
   * Devuelve un token nuevo porque el cambio invalida todos los anteriores,
   * incluido el que se está usando para hacer esta llamada.
   */
  @PermitePasswordPendiente()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("password/cambiar")
  @HttpCode(HttpStatus.OK)
  async cambiarPassword(
    @Body(new ZodValidationPipe(cambiarPasswordSchema)) dto: CambiarPasswordDto,
    @UsuarioActual() usuario: PayloadToken,
    @Req() peticion: Request,
  ) {
    return this.auth.cambiarPassword(
      usuario.sub,
      dto.passwordActual,
      dto.passwordNueva,
      contextoDe(peticion),
    );
  }

  /**
   * Regeneración de contraseña desde el backoffice (SPECS §6.1).
   *
   * Supervisores y administradores, porque el comercial en tienda necesita que
   * alguien accesible pueda desbloquearle: si solo pudiera un administrador,
   * un viernes por la tarde el comercial se queda sin trabajar.
   *
   * La contraseña temporal se devuelve una sola vez en la respuesta y no queda
   * almacenada en claro en ningún sitio.
   */
  @Roles("supervisor", "administrador")
  @Post("password/regenerar")
  @HttpCode(HttpStatus.OK)
  async regenerarPassword(
    @Body(new ZodValidationPipe(regenerarPasswordSchema)) dto: RegenerarPasswordDto,
    @UsuarioActual() ejecutor: PayloadToken,
    @Req() peticion: Request,
  ) {
    return this.auth.regenerarPassword(
      dto.usuarioId,
      ejecutor.sub,
      contextoDe(peticion),
    );
  }
}
