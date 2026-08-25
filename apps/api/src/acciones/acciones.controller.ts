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
  Put,
  Query,
} from "@nestjs/common";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import type { PayloadToken } from "../auth/auth.service";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { AccionesService } from "./acciones.service";
import {
  bandejaAccionesSchema,
  cambiarEstadoAccionSchema,
  comprobarSchema,
  catalogoSchema,
  registrarAccionSchema,
  relacionResponsableSchema,
  type BandejaAccionesDto,
  type CatalogoDto,
  type CambiarEstadoAccionDto,
  type ComprobarDto,
  type RegistrarAccionDto,
  type RelacionResponsableDto,
} from "./dto/acciones.dto";

/**
 * El ciclo detección → acción → seguimiento → resultado (SPECS §5.5 y §5.8).
 *
 * Las rutas se agrupan según a quién sirven: el GPV registra y comprueba desde
 * la visita; el FSM prioriza y cierra desde su bandeja. Ambos pueden cerrar una
 * acción, y en los dos casos queda registrado quién lo hizo.
 */
@Controller()
export class AccionesController {
  constructor(private readonly acciones: AccionesService) {}

  // ── Catálogos que necesitan los flujos ───────────────────────────────

  /**
   * Marcas y segmentos, para los flujos de facings y visibilidad.
   *
   * Sin `textoI18n`: son nombres propios y no se traducen. De ahí que no lleven
   * resolución de idioma como el resto de catálogos.
   */
  @Get("marcas")
  async marcas(@Query(new ZodValidationPipe(catalogoSchema)) query: CatalogoDto) {
    return this.acciones.marcasDisponibles(query.categoria);
  }

  /**
   * Referencias de producto, de las que el GPV elige el Top Pico que falta.
   *
   * NO es la base de datos de Top Picos —esa vive en otra aplicación del
   * cliente—, solo el catálogo que da nombres estables a las referencias.
   */
  @Get("referencias")
  async referencias(@Query(new ZodValidationPipe(catalogoSchema)) query: CatalogoDto) {
    return this.acciones.referenciasDisponibles(query.categoria);
  }

  // ── El GPV, en tienda ────────────────────────────────────────────────

  /**
   * Registrar una detección durante la visita.
   *
   * El cuerpo es una unión discriminada por `tipoSituacion`: cada flujo tiene
   * sus campos y el servidor rechaza las combinaciones imposibles (fechas fuera
   * de Dairy, un hueco "corregido" en Dairy, una nevera a retirar sin código).
   *
   * El responsable de actuar NO se manda: lo calcula el servidor.
   */
  @Roles("comercial")
  @Post("visitas/:id/acciones")
  @HttpCode(HttpStatus.CREATED)
  async registrar(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @Body(new ZodValidationPipe(registrarAccionSchema)) dto: RegistrarAccionDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.registrar(visitaId, usuario, dto);
  }

  /**
   * Lo que sigue abierto en una tienda.
   *
   * La app de campo la llama al iniciar la visita. Se presenta como contexto
   * útil, no como lista de deberes: si detectar cosas hiciera que la próxima
   * visita empiece con un reproche, el GPV dejaría de detectar.
   */
  @Get("tiendas/:id/acciones")
  async abiertasDeTienda(
    @Param("id", ParseUUIDPipe) tiendaId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.abiertasDeTienda(tiendaId, usuario);
  }

  /** Top Picos que siguen sin incorporarse en esta tienda. */
  @Get("tiendas/:id/top-picos-pendientes")
  async topPicosPendientes(
    @Param("id", ParseUUIDPipe) tiendaId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.topPicosPendientesDeTienda(tiendaId, usuario);
  }

  /**
   * Pronunciarse sobre una acción abierta.
   *
   * Cada comprobación se añade al historial; ninguna sobreescribe a la
   * anterior. Un desenlace de "resuelta" cierra la acción y deja constancia de
   * quién la cerró.
   */
  @Post("acciones/:id/comprobaciones")
  @HttpCode(HttpStatus.CREATED)
  async comprobar(
    @Param("id", ParseUUIDPipe) accionId: string,
    @Body(new ZodValidationPipe(comprobarSchema)) dto: ComprobarDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.comprobar(accionId, usuario, dto);
  }

  /** Historial completo de una acción: cuándo se comprobó y quién. */
  @Get("acciones/:id/comprobaciones")
  async historial(
    @Param("id", ParseUUIDPipe) accionId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    const filas = await this.acciones.historial(accionId, usuario);
    return filas.map((f) => ({
      id: f.comprobacion.id,
      desenlace: f.comprobacion.desenlace,
      comentario: f.comprobacion.comentario,
      comprobadaEn: f.comprobacion.comprobadaEn,
      autor: f.autor,
    }));
  }

  /**
   * Relación con el responsable de tienda: una por visita.
   *
   * Es `PUT` y no `POST` a propósito: en cada punto de venta hay un único
   * encargado, así que la operación es idempotente por naturaleza y el GPV
   * puede corregir lo que puso antes de cerrar.
   */
  @Roles("comercial")
  @Put("visitas/:id/responsable")
  async guardarRelacion(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @Body(new ZodValidationPipe(relacionResponsableSchema)) dto: RelacionResponsableDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.guardarRelacionResponsable(visitaId, usuario, dto);
  }

  /**
   * Resumen de lo registrado, antes de cerrar la visita.
   *
   * Informa de lo que falta pero no bloquea: en el MVP no hay mínimos
   * obligatorios para finalizar (decisión consciente del cliente).
   */
  @Get("visitas/:id/resumen")
  async resumen(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.resumenVisita(visitaId, usuario);
  }

  // ── El FSM, en el panel ──────────────────────────────────────────────

  /**
   * Bandeja de acciones pendientes, lo más antiguo primero.
   *
   * El supervisor ve solo su zona. `soloEstancadas=true` filtra las que superan
   * el umbral de antigüedad, que responde a "¿qué lleva demasiado tiempo
   * abierto?" sin cerrar nada automáticamente.
   */
  @Roles("supervisor", "administrador")
  @Get("acciones")
  async bandeja(
    @Query(new ZodValidationPipe(bandejaAccionesSchema)) query: BandejaAccionesDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.bandeja(usuario, query);
  }

  /**
   * Cuántas acciones del FSM ha cerrado un GPV en los últimos días.
   *
   * El panel lo usa para avisar. Va aparte de la bandeja porque esas acciones
   * ya están cerradas y no aparecen en ella.
   */
  @Roles("supervisor", "administrador")
  @Get("acciones/cerradas-por-gpv")
  async cerradasPorGpv(@UsuarioActual() usuario: PayloadToken) {
    return { total: await this.acciones.cerradasPorGpv(usuario) };
  }

  /** Cerrar o cambiar el estado de una acción desde el panel. */
  @Roles("supervisor", "administrador")
  @Patch("acciones/:id")
  async cambiarEstado(
    @Param("id", ParseUUIDPipe) accionId: string,
    @Body(new ZodValidationPipe(cambiarEstadoAccionSchema)) dto: CambiarEstadoAccionDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.cambiarEstado(accionId, usuario, dto);
  }
}
