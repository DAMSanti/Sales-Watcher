import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import type { PayloadToken } from "../auth/auth.service";
import { SincronizacionService } from "./sincronizacion.service";
import { loteSchema, type LoteDto } from "./dto/sincronizacion.dto";

@Controller("sincronizacion")
export class SincronizacionController {
  constructor(private readonly sincronizacion: SincronizacionService) {}

  /**
   * Vacía la cola offline de la PWA.
   *
   * Responde 200 aunque haya operaciones fallidas: el código HTTP describe si
   * el lote se procesó, no si todo su contenido era aplicable. Devolver 4xx
   * porque una de cincuenta operaciones tenía la ventana cerrada llevaría al
   * cliente a reintentar el lote entero, incluidas las cuarenta y nueve que sí
   * entraron.
   *
   * El detalle por operación va en el cuerpo, y es lo que el cliente usa para
   * decidir qué borra de la cola y qué reintenta.
   */
  @Roles("comercial")
  @Post("lote")
  @HttpCode(HttpStatus.OK)
  async lote(
    @Body(new ZodValidationPipe(loteSchema)) dto: LoteDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.sincronizacion.aplicarLote(dto.operaciones, usuario);
  }
}
