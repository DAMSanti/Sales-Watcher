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

/** Los "resultados conseguidos" (§10.3) solo desglosan por GPV o por tienda. */
const dimensionConseguidosSchema = z.object({
  dimension: z.enum(["gpv", "tienda"]).default("gpv"),
});

/** Análisis — PDV con más (§10.7): selector exacto entre estas dos. */
const tipoRankingSchema = z.object({
  tipo: z.enum(["oportunidades", "incidencias"]).default("oportunidades"),
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

  /**
   * "Resultados conseguidos" (documento FSM §10.3): las cinco métricas con
   * desglose Global → GPV → PDV. Facings ya tenía su propio endpoint
   * (`/resultados/facings`, con más dimensiones); aquí van las otras cuatro
   * juntas para no obligar al backoffice a hacer cuatro peticiones.
   */
  @Get("conseguidos")
  async conseguidos(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @Query(new ZodValidationPipe(dimensionConseguidosSchema)) dim: { dimension: "gpv" | "tienda" },
    @UsuarioActual() usuario: PayloadToken,
  ) {
    const [skuIncorporadas, bloquesMarca, nuevasImplantaciones, huecosSolucionados] =
      await Promise.all([
        this.resultados.skuIncorporadasDesglose(usuario, filtros, dim.dimension),
        this.resultados.bloquesMarcaDesglose(usuario, filtros, dim.dimension),
        this.resultados.nuevasImplantacionesDesglose(usuario, filtros, dim.dimension),
        this.resultados.huecosSolucionadosDesglose(usuario, filtros, dim.dimension),
      ]);
    return { skuIncorporadas, bloquesMarca, nuevasImplantaciones, huecosSolucionados };
  }

  /**
   * Gestión (documento FSM §10.6): conversión de oportunidades y resolución
   * de incidencias, con numérica absoluta + porcentaje y desglose Global →
   * GPV → PDV.
   */
  @Get("gestion")
  async gestion(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @Query(new ZodValidationPipe(dimensionConseguidosSchema)) dim: { dimension: "gpv" | "tienda" },
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.gestion(usuario, filtros, dim.dimension);
  }

  /**
   * Análisis — PDV con más (documento FSM §10.7): ranking de tiendas por
   * oportunidades o incidencias, respetando GPV y periodo. No es clicable
   * desde aquí — el cliente lo pide explícito; para investigar un PDV se usa
   * Tiendas.
   */
  @Get("ranking")
  async ranking(
    @Query(new ZodValidationPipe(filtrosSchema)) filtros: FiltrosDto,
    @Query(new ZodValidationPipe(tipoRankingSchema)) t: { tipo: "oportunidades" | "incidencias" },
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.resultados.rankingPdv(usuario, filtros, t.tipo);
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
