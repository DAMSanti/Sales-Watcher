import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { Idioma } from "@sw/shared";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { resolver } from "../comun/i18n";
import { IdiomaActual } from "../comun/idioma.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import type { PayloadToken } from "../auth/auth.service";
import { aCsv } from "./csv";
import { InformesService } from "./informes.service";
import {
  bandejaJustificacionesSchema,
  dashboardSchema,
  filtrosSchema,
  type BandejaJustificacionesDto,
  type DashboardDto,
  type FiltrosDto,
} from "./dto/informes.dto";

/**
 * Consultas agregadas para el backoffice (SPECS §6.2 y §6.3).
 *
 * Todas restringidas a supervisores y administradores, y todas acotadas por
 * zona cuando quien pregunta es supervisor: los informes de un supervisor
 * catalán no deben incluir a comerciales vascos que no gestiona.
 */
@Roles("supervisor", "administrador")
@Controller()
export class InformesController {
  constructor(private readonly informes: InformesService) {}

  /** Estado del día: lo que el supervisor mira por la mañana. */
  @Get("dashboard")
  async dashboard(
    @Query(new ZodValidationPipe(dashboardSchema)) query: DashboardDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.informes.dashboard(usuario, query.fecha);
  }

  /** Cobertura: realizado frente a asignado, por zona y por comercial. */
  @Get("informes/cobertura")
  async cobertura(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.informes.cobertura(usuario, filtros);
  }

  /** Tasa de no realización y desglose por motivo. */
  @Get("informes/no-realizacion")
  async noRealizacion(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const informe = await this.informes.noRealizacion(usuario, filtros);
    return {
      ...informe,
      porMotivo: informe.porMotivo.map((m) => ({
        ...m,
        texto: resolver(m.texto, idioma),
      })),
    };
  }

  /** Cumplimiento de checklist, duración media y visitas incompletas. */
  @Get("informes/ejecucion")
  async ejecucion(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.informes.ejecucion(usuario, filtros);
  }

  /** Incidencias por categoría y tiendas que más acumulan. */
  @Get("informes/incidencias")
  async incidencias(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const informe = await this.informes.informeIncidencias(usuario, filtros);
    return {
      ...informe,
      porCategoria: informe.porCategoria.map((c) => ({
        ...c,
        nombre: resolver(c.nombre, idioma),
      })),
    };
  }

  /**
   * Bandeja de justificaciones.
   *
   * Incluye las no realizadas sin justificar, que no tienen fila en la tabla
   * de justificaciones y son justamente las que hay que reclamar.
   */
  @Get("justificaciones")
  async justificaciones(
    @Query(new ZodValidationPipe(bandejaJustificacionesSchema))
    query: BandejaJustificacionesDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const filas = await this.informes.bandejaJustificaciones(
      usuario,
      query,
      query.soloPendientes,
    );
    return filas.map((f) => ({ ...f, motivo: resolver(f.motivo, idioma) }));
  }

  /**
   * Exportación de la cobertura por comercial.
   *
   * CSV con BOM y CRLF: se abre directamente en Excel con los acentos
   * correctos, que es lo que pide SPECS §6.3 por el lado de la hoja de
   * cálculo. La exportación a PDF sigue pendiente y necesita una librería de
   * composición; no se simula aquí.
   */
  @Get("informes/cobertura.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async coberturaCsv(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
    @Res() respuesta: Response,
  ) {
    const informe = await this.informes.cobertura(usuario, filtros);
    const nombre = `cobertura_${filtros.desde}_${filtros.hasta}.csv`;

    respuesta.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    respuesta.send(aCsv(informe.porComercial as Array<Record<string, unknown>>));
  }

  /** Exportación del desglose de no realización. */
  @Get("informes/no-realizacion.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async noRealizacionCsv(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
    @Res() respuesta: Response,
  ) {
    const informe = await this.informes.noRealizacion(usuario, filtros);
    const filas = informe.porMotivo.map((m) => ({
      codigo: m.codigo,
      motivo: resolver(m.texto, idioma),
      total: m.total,
      porcentaje: m.porcentaje,
      aceptadas: m.aceptadas,
      cuestionadas: m.cuestionadas,
      pendientesRevision: m.pendientesRevision,
    }));

    const nombre = `no_realizacion_${filtros.desde}_${filtros.hasta}.csv`;
    respuesta.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    respuesta.send(aCsv(filas));
  }
}
