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
import { z } from "zod";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import type { PayloadToken } from "../auth/auth.service";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { ProductosService } from "./productos.service";

const categoria = z.enum(["dairy", "waters", "pbb"]);

const marcaSchema = z.object({
  nombre: z.string().min(1).max(120),
  codigo: z.string().min(1).max(64),
  categoriaProducto: categoria,
  orden: z.number().int().min(0).optional(),
});

const editarMarcaSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  orden: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
});

const referenciaSchema = z.object({
  nombre: z.string().min(1).max(200),
  codigo: z.string().min(1).max(64),
  categoriaProducto: categoria,
  marcaId: z.string().uuid().optional(),
  orden: z.number().int().min(0).optional(),
});

const editarReferenciaSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  marcaId: z.string().uuid().nullable().optional(),
  orden: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
});

const listarSchema = z.object({
  categoria: categoria.optional(),
  incluirInactivas: z.coerce.boolean().optional(),
});

const importarSchema = z.object({ contenido: z.string().min(1) });

/**
 * Gestión de marcas y referencias de producto (SPECS §6.1).
 *
 * Alta y edición para administradores; la lectura la necesitan también los
 * flujos de la app de campo, que ya la tienen por `/marcas` y `/referencias`.
 */
@Controller("catalogos")
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Roles("supervisor", "administrador")
  @Get("marcas")
  async listarMarcas(
    @Query(new ZodValidationPipe(listarSchema)) query: z.infer<typeof listarSchema>,
  ) {
    return this.productos.listarMarcas(query.incluirInactivas ?? false);
  }

  @Roles("administrador")
  @Post("marcas")
  async crearMarca(
    @Body(new ZodValidationPipe(marcaSchema)) dto: z.infer<typeof marcaSchema>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.productos.crearMarca(dto, usuario);
  }

  /** Se desactivan, no se borran: borrarlas rompería el histórico de facings. */
  @Roles("administrador")
  @Patch("marcas/:id")
  async editarMarca(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarMarcaSchema)) dto: z.infer<typeof editarMarcaSchema>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.productos.editarMarca(id, dto, usuario);
  }

  @Roles("supervisor", "administrador")
  @Get("referencias")
  async listarReferencias(
    @Query(new ZodValidationPipe(listarSchema)) query: z.infer<typeof listarSchema>,
  ) {
    return this.productos.listarReferencias({
      ...(query.categoria ? { categoria: query.categoria } : {}),
      ...(query.incluirInactivas !== undefined
        ? { incluirInactivas: query.incluirInactivas }
        : {}),
    });
  }

  @Roles("administrador")
  @Post("referencias")
  async crearReferencia(
    @Body(new ZodValidationPipe(referenciaSchema)) dto: z.infer<typeof referenciaSchema>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.productos.crearReferencia(dto, usuario);
  }

  @Roles("administrador")
  @Patch("referencias/:id")
  async editarReferencia(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarReferenciaSchema))
    dto: z.infer<typeof editarReferenciaSchema>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.productos.editarReferencia(id, dto, usuario);
  }

  /**
   * Importación masiva.
   *
   * Es el camino previsto para poblar el catálogo: son cientos de referencias.
   * Tolerante a filas malas — una categoría mal escrita no debe abortar las
   * otras trescientas.
   */
  @Roles("administrador")
  @Post("referencias/importar")
  async importar(
    @Body(new ZodValidationPipe(importarSchema)) dto: z.infer<typeof importarSchema>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.productos.importarCsv(dto.contenido, usuario);
  }
}
