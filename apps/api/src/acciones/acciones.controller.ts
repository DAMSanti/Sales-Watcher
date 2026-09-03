import {
  Body,
  Controller,
  Delete,
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
import { DetalleVisitaService } from "./detalle-visita.service";
import {
  actividadSchema,
  bandejaAccionesSchema,
  cambiarEstadoAccionSchema,
  comprobarSchema,
  catalogoSchema,
  historicoTiendaSchema,
  registrarAccionSchema,
  relacionResponsableSchema,
  type ActividadDto,
  type BandejaAccionesDto,
  type CatalogoDto,
  type CambiarEstadoAccionDto,
  type ComprobarDto,
  type HistoricoTiendaDto,
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
  constructor(
    private readonly acciones: AccionesService,
    private readonly detalleVisitaService: DetalleVisitaService,
  ) {}

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

  /**
   * Lo registrado en esta visita, para que el GPV pueda revisarlo y borrar un
   * misclick mientras sigue en la tienda.
   */
  @Roles("comercial")
  @Get("visitas/:id/acciones")
  async registradasEnVisita(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.registradasEnVisita(visitaId, usuario);
  }

  /**
   * Elimina una acción registrada por error.
   *
   * Solo mientras la visita que la originó sigue abierta — pasada esa
   * ventana, lo que hace falta es descartarla desde el panel del FSM
   * (`PATCH acciones/:id`), no borrarla: puede que ya haya cruzado a la
   * tienda como pendiente de seguimiento.
   */
  @Roles("comercial")
  @Delete("acciones/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @Param("id", ParseUUIDPipe) accionId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    await this.acciones.eliminar(accionId, usuario);
  }

  /**
   * Histórico de una tienda: acciones ya cerradas (SPECS §6.4).
   *
   * Complementa a `abiertasDeTienda` — juntas forman las dos zonas que pide la
   * ficha de tienda del backoffice.
   */
  @Roles("supervisor", "administrador")
  @Get("tiendas/:id/historico")
  async historicoDeTienda(
    @Param("id", ParseUUIDPipe) tiendaId: string,
    @Query(new ZodValidationPipe(historicoTiendaSchema)) query: HistoricoTiendaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.historicoDeTienda(tiendaId, usuario, query);
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

  /**
   * Pantalla Actividad (SPECS §6.2): qué ha ocurrido en un periodo, agrupado
   * por tienda. No sustituye al histórico de la tienda — es contexto reciente.
   */
  @Roles("supervisor", "administrador")
  @Get("actividad")
  async actividad(
    @Query(new ZodValidationPipe(actividadSchema)) query: ActividadDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.acciones.actividad(usuario, query);
  }

  // ── El FSM, en el panel ──────────────────────────────────────────────

  /**
   * Detalle completo de una visita, en solo lectura.
   *
   * Organizado por categoría de producto y con las evidencias de cada acción.
   * NO trae la duración: se muestran las horas de inicio y fin, que son parte
   * del registro, pero no el intervalo entre ellas (SPECS §6.2).
   */
  @Roles("supervisor", "administrador")
  @Get("visitas/:id/detalle")
  async detalleVisita(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.detalleVisitaService.detalle(visitaId, usuario);
  }

  /**
   * Histórico de la relación con el responsable de una tienda.
   *
   * Una valoración suelta no dice nada; la serie enseña si la relación mejora,
   * se deteriora o depende de quién visite.
   */
  @Roles("supervisor", "administrador")
  @Get("tiendas/:id/relacion-responsable")
  async historicoResponsable(
    @Param("id", ParseUUIDPipe) tiendaId: string,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.detalleVisitaService.historicoResponsable(tiendaId, usuario);
  }

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
