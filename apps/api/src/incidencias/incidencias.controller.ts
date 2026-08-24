import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { Idioma } from "@sw/shared";
import { resolver } from "../comun/i18n";
import { IdiomaActual } from "../comun/idioma.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import type { PayloadToken } from "../auth/auth.service";
import { IncidenciasService } from "./incidencias.service";
import {
  bandejaSchema,
  cambiarEstadoSchema,
  categoriasSchema,
  crearIncidenciaSchema,
  type BandejaDto,
  type CambiarEstadoDto,
  type CategoriasDto,
  type CrearIncidenciaDto,
} from "./dto/incidencias.dto";

@Controller()
export class IncidenciasController {
  constructor(private readonly incidencias: IncidenciasService) {}

  /**
   * Catálogo de categorías, resuelto al idioma del usuario.
   *
   * Accesible a cualquier rol autenticado: el comercial lo necesita para el
   * desplegable y el backoffice para los filtros de la bandeja.
   */
  @Get("categorias")
  async categorias(
    @Query(new ZodValidationPipe(categoriasSchema)) query: CategoriasDto,
    @IdiomaActual() idioma: Idioma,
  ) {
    const lista = await this.incidencias.categoriasDisponibles(query.tipo);
    return lista.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      tipo: c.tipo,
      nombre: resolver(c.nombre, idioma),
      prioridadDefecto: c.prioridadDefecto,
    }));
  }

  /** Reportar una incidencia u oportunidad durante la visita. */
  @Roles("comercial")
  @Post("visitas/:id/incidencias")
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @Body(new ZodValidationPipe(crearIncidenciaSchema)) dto: CrearIncidenciaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.incidencias.crear(visitaId, usuario, dto);
  }

  /** Incidencias de una visita. El comercial ve las suyas; el backoffice, todas. */
  @Get("visitas/:id/incidencias")
  async deLaVisita(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const filas = await this.incidencias.deLaVisita(visitaId, usuario);
    return filas.map((f) => ({
      id: f.incidencia.id,
      categoria: {
        id: f.categoria.id,
        codigo: f.categoria.codigo,
        tipo: f.categoria.tipo,
        nombre: resolver(f.categoria.nombre, idioma),
      },
      descripcion: f.incidencia.descripcion,
      prioridad: f.incidencia.prioridad,
      estado: f.incidencia.estado,
      fotos: f.fotosConfirmadas,
      creadoEn: f.incidencia.creadoEn,
    }));
  }

  /**
   * Bandeja de incidencias del backoffice.
   *
   * El supervisor ve solo su zona; el administrador, todas. Sin ese filtro, la
   * bandeja de un supervisor catalán se llenaría de incidencias vascas que no
   * puede resolver.
   */
  @Roles("supervisor", "administrador")
  @Get("incidencias")
  async bandeja(
    @Query(new ZodValidationPipe(bandejaSchema)) query: BandejaDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const filas = await this.incidencias.bandeja(usuario, query);
    return filas.map((f) => ({
      id: f.incidencia.id,
      categoria: {
        codigo: f.categoria.codigo,
        tipo: f.categoria.tipo,
        nombre: resolver(f.categoria.nombre, idioma),
      },
      descripcion: f.incidencia.descripcion,
      prioridad: f.incidencia.prioridad,
      estado: f.incidencia.estado,
      tienda: f.tienda,
      comercial: f.comercial,
      fecha: f.fecha,
      creadoEn: f.incidencia.creadoEn,
    }));
  }

  /** Marcar como revisada, resuelta o descartada, y asignar. */
  @Roles("supervisor", "administrador")
  @Patch("incidencias/:id")
  async cambiarEstado(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cambiarEstadoSchema)) dto: CambiarEstadoDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.incidencias.cambiarEstado(id, dto.estado, usuario, dto);
  }
}
