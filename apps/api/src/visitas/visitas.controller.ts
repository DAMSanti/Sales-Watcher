import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import type { Idioma } from "@sw/shared";
import { IdiomaActual } from "../comun/idioma.decorator";
import { resolver } from "../comun/i18n";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import type { PayloadToken } from "../auth/auth.service";
import { ChecklistService } from "./checklist.service";
import { JustificacionesService } from "./justificaciones.service";
import { VisitasService } from "./visitas.service";
import { marcarItemSchema, type MarcarItemDto } from "./dto/checklist.dto";
import {
  comenzarVisitaSchema,
  crearVisitaSchema,
  finalizarVisitaSchema,
  justificarSchema,
  vistaDelDiaSchema,
  type ComenzarVisitaDto,
  type CrearVisitaDto,
  type FinalizarVisitaDto,
  type JustificarDto,
  type VistaDelDiaDto,
} from "./dto/visitas.dto";

/**
 * Operaciones de campo.
 *
 * Todas restringidas al rol comercial: las acciones de visita pertenecen a
 * quien pisa la tienda. Que un supervisor pudiera comenzar o finalizar una
 * visita contaminaría el registro de actividad, que es lo que este sistema
 * existe para documentar (CONVENTIONS).
 */
@Controller("visitas")
export class VisitasController {
  constructor(
    private readonly visitas: VisitasService,
    private readonly justificaciones: JustificacionesService,
    private readonly checklist: ChecklistService,
  ) {}

  /** Vista del día: ruta planificada más visitas extra, en una sola lista. */
  @Roles("comercial")
  @Get("dia")
  async vistaDelDia(
    @Query(new ZodValidationPipe(vistaDelDiaSchema)) query: VistaDelDiaDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    return this.visitas.vistaDelDia(usuario, idioma, query.fecha);
  }

  /** Crea una visita fuera de ruta desde el buscador de tiendas. */
  @Roles("comercial")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body(new ZodValidationPipe(crearVisitaSchema)) dto: CrearVisitaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.visitas.crearNoPlanificada(dto.tiendaId, usuario, dto.idCliente);
  }

  /**
   * Check-in. Devuelve la evaluación de desviación para que la app pueda
   * avisar al comercial en el momento, no solo dejar el rastro al supervisor.
   */
  @Roles("comercial")
  @Post(":id/comenzar")
  @HttpCode(HttpStatus.OK)
  async comenzar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(comenzarVisitaSchema)) dto: ComenzarVisitaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.visitas.comenzar(id, usuario, dto);
  }

  /**
   * Check-out. Si quedan ítems obligatorios sin completar, la visita se cierra
   * igualmente marcada como incompleta, y se devuelven cuáles faltaron.
   */
  @Roles("comercial")
  @Post(":id/finalizar")
  @HttpCode(HttpStatus.OK)
  async finalizar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(finalizarVisitaSchema)) dto: FinalizarVisitaDto,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const resultado = await this.visitas.finalizar(id, usuario, dto);
    return {
      ...resultado,
      itemsPendientes: resultado.itemsPendientes.map((i) => ({
        id: i.id,
        texto: resolver(i.texto, idioma),
      })),
    };
  }

  /** Catálogo de motivos, resuelto al idioma del comercial. */
  @Roles("comercial")
  @Get("motivos")
  async motivos(@IdiomaActual() idioma: Idioma) {
    const motivos = await this.justificaciones.motivosDisponibles();
    return motivos.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      texto: resolver(m.texto, idioma),
      requiereComentario: m.requiereComentario,
    }));
  }

  /** "No he podido visitarla". Sujeto a la ventana diaria. */
  @Roles("comercial")
  @Post(":id/justificar")
  @HttpCode(HttpStatus.CREATED)
  async justificar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(justificarSchema)) dto: JustificarDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.justificaciones.justificar(id, usuario, dto);
  }

  /**
   * Checklist de la visita.
   *
   * Materializa los resultados que falten, lo que permite adjuntar una foto a
   * un ítem antes de marcarlo: sin fila de resultado no habría a qué asociar
   * la fotografía, y el ítem que la exige nunca podría completarse.
   */
  @Get(":id/checklist")
  async checklistDeVisita(
    @Param("id", ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const resultado = await this.checklist.delaVisita(id, usuario);
    return {
      ...resultado,
      items: resultado.items.map((i) => ({
        ...i,
        texto: resolver(i.texto, idioma),
      })),
    };
  }

  /** Marcar o desmarcar un ítem del checklist. */
  @Roles("comercial")
  @Post(":id/checklist/:itemId")
  @HttpCode(HttpStatus.OK)
  async marcarItem(
    @Param("id", ParseUUIDPipe) visitaId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(marcarItemSchema)) dto: MarcarItemDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.checklist.marcar(
      visitaId,
      itemId,
      dto.completado,
      usuario,
      dto.capturadaEn,
    );
  }

  /**
   * Contexto de la visita anterior a la misma tienda.
   *
   * Se pide aparte de la visita para que la pantalla se pinte sin esperarlo:
   * es información útil, no imprescindible para empezar a trabajar.
   */
  @Roles("comercial")
  @Get(":id/contexto")
  async contexto(
    @Param("id", ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: PayloadToken,
    @IdiomaActual() idioma: Idioma,
  ) {
    const contexto = await this.visitas.contextoAnterior(id, usuario);
    return {
      ...contexto,
      incidenciasAbiertas: contexto.incidenciasAbiertas.map((i) => ({
        ...i,
        categoria: resolver(i.categoria, idioma),
      })),
    };
  }
}
