import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { AuditoriaService } from "../auditoria/auditoria.service";
import type { PayloadToken } from "../auth/auth.service";
import { NormalizacionVideoService } from "./normalizacion-video.service";
import { PurgaEvidenciasService } from "./purga-evidencias.service";
import { CierreJornadaService } from "../visitas/cierre-jornada.service";

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
    private readonly purga: PurgaEvidenciasService,
    private readonly normalizacion: NormalizacionVideoService,
    private readonly cierre: CierreJornadaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Roles("administrador")
  @Post("purga-evidencias")
  @HttpCode(HttpStatus.OK)
  async purgarEvidencias(@UsuarioActual() usuario: PayloadToken) {
    const resultado = await this.purga.ejecutar();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "mantenimiento.purga_evidencias",
      entidad: "evidencia",
      cambios: {
        caducadas: { antes: null, despues: resultado.caducadas },
        abandonadas: { antes: null, despues: resultado.abandonadas },
      },
    });

    return resultado;
  }

  /**
   * Dispara una pasada de normalización de vídeo.
   *
   * Existe además del cron para poder probar el proceso sin esperar diez
   * minutos, y para vaciar la cola a mano tras una incidencia.
   */
  @Roles("administrador")
  @Post("normalizar-videos")
  @HttpCode(HttpStatus.OK)
  async normalizarVideos(@UsuarioActual() usuario: PayloadToken) {
    const resultado = await this.normalizacion.ejecutar();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "mantenimiento.normalizar_videos",
      entidad: "evidencia",
      cambios: {
        normalizados: { antes: null, despues: resultado.normalizados },
        fallidos: { antes: null, despues: resultado.fallidos },
      },
    });

    return resultado;
  }

  /**
   * Dispara el cierre de jornada a mano.
   *
   * Corre programado cada hora, pero poder forzarlo hace falta para
   * recuperarse de una caída prolongada de la API: si el proceso no se
   * ejecutó durante la noche, las visitas de ayer seguirían en pendiente y
   * nadie las vería en la bandeja.
   */
  @Roles("administrador")
  @Post("cierre-jornada")
  @HttpCode(HttpStatus.OK)
  async cerrarJornada(@UsuarioActual() usuario: PayloadToken) {
    const resultado = await this.cierre.ejecutar();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "mantenimiento.cierre_jornada",
      entidad: "visita",
      cambios: {
        cerradas: { antes: null, despues: resultado.cerradas },
      },
    });

    return resultado;
  }
}
