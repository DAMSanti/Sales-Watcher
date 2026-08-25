import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import type { PayloadToken } from "../auth/auth.service";
import { TiendasService } from "./tiendas.service";
import {
  buscarTiendasSchema,
  importarCsvSchema,
  tiendaSchema,
  type BuscarTiendasDto,
  type ImportarCsvDto,
  type TiendaDto,
} from "./dto/tiendas.dto";

@Controller("tiendas")
export class TiendasController {
  constructor(private readonly tiendas: TiendasService) {}

  /**
   * Buscador, compartido por el "Añadir visita" del GPV y el backoffice.
   *
   * Busca por **código `350…` y por nombre al mismo nivel** (SPECS §5.3): el
   * código es la vía rápida cuando se conoce, y el nombre no debe ser el
   * camino de segunda para quien no lo recuerda delante de la tienda.
   *
   * Un GPV nunca ve tiendas inactivas, pida lo que pida: crear una visita a
   * una tienda dada de baja generaría actividad sobre algo que ya no existe.
   *
   * ── El alcance del GPV ────────────────────────────────────────────
   *
   * El boceto dice que se busca «entre las tiendas asignadas al GPV», y el
   * modelo NO tiene asignación tienda-GPV: lo más parecido que expresa es la
   * zona. Se acota por zona, que es lo correcto que se puede hacer hoy, y
   * queda anotado que la asignación individual no existe.
   *
   * Con una sola zona en la operación actual esto no filtra nada en la
   * práctica, pero fija el comportamiento para cuando haya más.
   */
  @Get()
  async buscar(
    @Query(new ZodValidationPipe(buscarTiendasSchema)) query: BuscarTiendasDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    const esGpv = usuario.rol === "comercial";

    return this.tiendas.buscar({
      ...query,
      // Un GPV no puede ampliar su propio alcance pasando otra zona.
      ...(esGpv && usuario.zonaId ? { zonaId: usuario.zonaId } : {}),
      soloActivas: esGpv ? true : !query.incluirInactivas,
    });
  }

  @Roles("administrador")
  @Post()
  async crear(
    @Body(new ZodValidationPipe(tiendaSchema)) dto: TiendaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.tiendas.crear(dto, usuario);
  }

  @Roles("administrador")
  @Patch(":id")
  async editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tiendaSchema.partial())) dto: Partial<TiendaDto>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.tiendas.editar(id, dto, usuario);
  }

  /**
   * Carga masiva desde CSV.
   *
   * Devuelve el detalle de lo rechazado con número de fila y motivo: un
   * fichero de tres mil tiendas con dos filas malas debe cargar las demás y
   * decir exactamente cuáles fallaron.
   */
  @Roles("administrador")
  @Post("importar")
  async importar(
    @Body(new ZodValidationPipe(importarCsvSchema)) dto: ImportarCsvDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.tiendas.importarCsv(dto.contenido, usuario);
  }
}
