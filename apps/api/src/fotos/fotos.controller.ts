import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { Roles } from "../auth/decoradores/roles.decorator";
import type { PayloadToken } from "../auth/auth.service";
import { FotosService } from "./fotos.service";
import { solicitarSubidaSchema, type SolicitarSubidaDto } from "./dto/fotos.dto";

@Controller("fotos")
export class FotosController {
  constructor(private readonly fotos: FotosService) {}

  /**
   * Paso 1: reservar la foto y obtener la URL firmada de subida.
   *
   * Solo comerciales: las fotos las hace quien pisa la tienda. Un supervisor
   * subiendo fotos a una visita contaminaría el registro de actividad.
   */
  @Roles("comercial")
  @Post("subida")
  @HttpCode(HttpStatus.OK)
  async solicitarSubida(
    @Body(new ZodValidationPipe(solicitarSubidaSchema)) dto: SolicitarSubidaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.fotos.solicitarSubida(dto, usuario);
  }

  /**
   * Paso 2: confirmar que la subida terminó.
   *
   * El servidor verifica contra el almacenamiento; no basta con que el
   * cliente lo afirme.
   */
  @Roles("comercial")
  @Post(":id/confirmar")
  @HttpCode(HttpStatus.OK)
  async confirmar(
    @Param("id", ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.fotos.confirmarSubida(id, usuario);
  }

  /** URL firmada de descarga, de vida corta. */
  @Get(":id/url")
  async url(
    @Param("id", ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.fotos.urlDeDescarga(id, usuario);
  }
}
