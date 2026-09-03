import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import type { PayloadToken } from "../auth/auth.service";
import {
  compararPeriodosSchema,
  filtrosSchema,
  type CompararPeriodosDto,
  type FiltrosDto,
} from "./dto/informes.dto";
import { ResultadosService } from "./resultados.service";

/**
 * Cuántas veces tiene que repetirse algo para llamarlo patrón.
 *
 * Dos es el mínimo que significa "otra vez": con uno no hay repetición, y
 * exigir tres escondería el problema durante un mes entero de rutero.
 */
const repeticionesSchema = z.object({
  minimoRepeticiones: z.coerce.number().int().min(2).max(20).default(2),
});

const dimensionSchema = z.object({
  dimension: z.enum(["gpv", "tienda", "categoria", "marca", "mes"]).default("gpv"),
});

/**
 * Dashboard de resultados (SPECS §6.4).
 *
 * Responde a las once preguntas del cliente. Separado de los informes de
 * actividad porque miden cosas distintas: aquellos cuentan visitas, estos
 * cuentan lo que esas visitas consiguieron.
 */
@Roles("supervisor", "administrador")
@Controller("resultados")
export class ResultadosController {
  constructor(private readonly resultados: ResultadosService) {}

  /** Las once preguntas en una sola llamada, para pintar el panel. */
  @Get()
  async panel(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @Query(new ZodValidationPipe(repeticionesSchema)) rep: { minimoRepeticiones: number },
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.panel(usuario, filtros, rep.minimoRepeticiones);
  }

  /** Preguntas 1-3: de lo detectado, cuánto se trabajó y cuánto se resolvió. */
  @Get("embudo")
  async embudo(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.embudo(usuario, filtros);
  }

  /**
   * Pregunta 4: facings ganados.
   *
   * `dimension` elige el desglose. El cliente pide poder acumular por GPV,
   * tienda, categoría, marca y mes, y cada uno responde a una conversación
   * distinta.
   */
  @Get("facings")
  async facings(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @Query(new ZodValidationPipe(dimensionSchema)) dim: { dimension: string },
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.facings(usuario, filtros, dim.dimension);
  }

  /** Pregunta 5: Top Picos incorporados, por fecha de incorporación. */
  @Get("top-picos")
  async topPicos(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.topPicosIncorporados(usuario, filtros);
  }

  /** Preguntas 6 y 7: faltas de stock que se repiten y tiendas problemáticas. */
  @Get("patrones")
  async patrones(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @Query(new ZodValidationPipe(repeticionesSchema)) rep: { minimoRepeticiones: number },
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.patrones(usuario, filtros, rep.minimoRepeticiones);
  }

  /** Pregunta 8: lo que lleva demasiado tiempo abierto. Sin filtro de periodo. */
  @Get("seguimiento")
  async seguimiento(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.seguimiento(usuario, filtros);
  }

  /** Preguntas 9 y 10, juntas en la misma fila por diseño. */
  @Get("equipo")
  async equipo(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.equipo(usuario, filtros);
  }

  /** Comparar periodos (documento FSM §10.8): dos periodos elegidos libremente. */
  @Get("comparar")
  async comparar(
    @Query(new ZodValidationPipe(compararPeriodosSchema)) dto: CompararPeriodosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.compararPeriodos(usuario, dto);
  }

  /** Pregunta 11: oportunidades detectadas que no acabaron en resultado. */
  @Get("perdidas")
  async perdidas(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.perdidas(usuario, filtros);
  }
}
