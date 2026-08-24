import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { AuditoriaService } from "../auditoria/auditoria.service";
import type { PayloadToken } from "../auth/auth.service";
import { PurgaFotosService } from "./purga-fotos.service";

/**
 * Operaciones de mantenimiento, solo para administradores.
 *
 * La purga ya corre programada de madrugada, pero poder dispararla a mano
 * hace falta por dos motivos:
 *
 *  - Cuando negocio fije por fin el plazo de retención (P7), habrá que hacer
 *    un borrado retroactivo sobre las fotos ya acumuladas sin esperar al cron
 *    ni desplegar nada.
 *  - Sin este endpoint, el proceso solo se podría probar esperando a las 3 de
 *    la mañana o desplegando código de prueba.
 *
 * Queda registrado en auditoría: es una operación destructiva y debe constar
 * quién la lanzó.
 */
@Controller("mantenimiento")
export class MantenimientoController {
  constructor(
    private readonly purga: PurgaFotosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Roles("administrador")
  @Post("purga-fotos")
  @HttpCode(HttpStatus.OK)
  async purgarFotos(@UsuarioActual() usuario: PayloadToken) {
    const resultado = await this.purga.ejecutar();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "mantenimiento.purga_fotos",
      entidad: "foto",
      cambios: {
        caducadas: { antes: null, despues: resultado.caducadas },
        abandonadas: { antes: null, despues: resultado.abandonadas },
      },
    });

    return resultado;
  }
}
