import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import {
  categorias,
  motivosNoRealizacion,
  tiposTienda,
  zonas,
} from "@sw/db";
import { idiomasFaltantes } from "@sw/shared";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";
import { CatalogosService, type TipoCatalogo } from "./catalogos.service";
import {
  activoSchema,
  categoriaSchema,
  motivoSchema,
  tipoTiendaSchema,
  zonaSchema,
  type ActivoDto,
  type CategoriaDto,
  type MotivoDto,
  type TipoTiendaDto,
  type ZonaDto,
} from "./dto/catalogos.dto";

/**
 * Gestión de catálogos configurables (SPECS §6.1).
 *
 * Solo administradores. Un supervisor puede gestionar incidencias de su zona,
 * pero cambiar el catálogo de categorías afecta a toda la operación y a lo que
 * ven todos los comerciales.
 *
 * Estas pantallas no son un lujo: el catálogo definitivo sigue en negociación
 * con el cliente y va a cambiar después de arrancar, así que tiene que poder
 * editarse sin desplegar.
 */
@Roles("administrador")
@Controller("catalogos")
export class CatalogosController {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly catalogos: CatalogosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Qué traducciones faltan, por catálogo. Alimenta el aviso del backoffice. */
  @Get("traducciones")
  async traducciones() {
    return this.catalogos.estadoTraducciones();
  }

  // ── Categorías de incidencia y oportunidad ─────────────────────────

  @Get("categorias")
  async listarCategorias() {
    const filas = await this.db
      .select()
      .from(categorias)
      .orderBy(asc(categorias.tipo), asc(categorias.orden));
    return filas.map((c) => ({ ...c, faltanIdiomas: idiomasFaltantes(c.nombre) }));
  }

  @Post("categorias")
  async crearCategoria(
    @Body(new ZodValidationPipe(categoriaSchema)) dto: CategoriaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    this.catalogos.validarTexto(dto.nombre, "nombre");

    return this.catalogos.protegerCodigoDuplicado(dto.codigo, async () => {
      const [creada] = await this.db.insert(categorias).values(dto).returning();
      await this.auditoria.registrar({
        usuarioId: usuario.sub,
        numeroTrabajador: usuario.numeroTrabajador,
        accion: "catalogo.categoria_creada",
        entidad: "categorias",
        entidadId: creada!.id,
        cambios: { codigo: { antes: null, despues: dto.codigo } },
      });
      return creada;
    });
  }

  @Patch("categorias/:id")
  async editarCategoria(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(categoriaSchema.partial())) dto: Partial<CategoriaDto>,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    if (dto.nombre) this.catalogos.validarTexto(dto.nombre, "nombre");

    /**
     * El código NO se puede cambiar. Es la clave estable que usan los datos
     * semilla y cualquier integración; renombrarlo rompería referencias
     * externas silenciosamente. Para "renombrar", se desactiva y se crea otra.
     */
    const { codigo: _ignorado, ...cambios } = dto;

    const [actualizada] = await this.db
      .update(categorias)
      .set({ ...cambios, actualizadoEn: new Date() })
      .where(eq(categorias.id, id))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "catalogo.categoria_editada",
      entidad: "categorias",
      entidadId: id,
    });

    return actualizada;
  }

  // ── Motivos de no realización ──────────────────────────────────────

  @Get("motivos")
  async listarMotivos() {
    const filas = await this.db
      .select()
      .from(motivosNoRealizacion)
      .orderBy(asc(motivosNoRealizacion.orden));
    return filas.map((m) => ({ ...m, faltanIdiomas: idiomasFaltantes(m.texto) }));
  }

  @Post("motivos")
  async crearMotivo(
    @Body(new ZodValidationPipe(motivoSchema)) dto: MotivoDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    this.catalogos.validarTexto(dto.texto, "texto");

    return this.catalogos.protegerCodigoDuplicado(dto.codigo, async () => {
      const [creado] = await this.db
        .insert(motivosNoRealizacion)
        .values(dto)
        .returning();
      await this.auditoria.registrar({
        usuarioId: usuario.sub,
        numeroTrabajador: usuario.numeroTrabajador,
        accion: "catalogo.motivo_creado",
        entidad: "motivos",
        entidadId: creado!.id,
      });
      return creado;
    });
  }

  @Patch("motivos/:id")
  async editarMotivo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(motivoSchema.partial())) dto: Partial<MotivoDto>,
  ) {
    if (dto.texto) this.catalogos.validarTexto(dto.texto, "texto");
    const { codigo: _ignorado, ...cambios } = dto;

    const [actualizado] = await this.db
      .update(motivosNoRealizacion)
      .set({ ...cambios, actualizadoEn: new Date() })
      .where(eq(motivosNoRealizacion.id, id))
      .returning();
    return actualizado;
  }

  // ── Tipos de tienda ────────────────────────────────────────────────

  @Get("tipos-tienda")
  async listarTiposTienda() {
    const filas = await this.db.select().from(tiposTienda).orderBy(asc(tiposTienda.codigo));
    return filas.map((t) => ({ ...t, faltanIdiomas: idiomasFaltantes(t.nombre) }));
  }

  @Post("tipos-tienda")
  async crearTipoTienda(
    @Body(new ZodValidationPipe(tipoTiendaSchema)) dto: TipoTiendaDto,
  ) {
    this.catalogos.validarTexto(dto.nombre, "nombre");
    return this.catalogos.protegerCodigoDuplicado(dto.codigo, async () => {
      const [creado] = await this.db.insert(tiposTienda).values(dto).returning();
      return creado;
    });
  }

  // ── Zonas ──────────────────────────────────────────────────────────

  @Get("zonas")
  async listarZonas() {
    const filas = await this.db.select().from(zonas).orderBy(asc(zonas.codigo));
    return filas.map((z) => ({ ...z, faltanIdiomas: idiomasFaltantes(z.nombre) }));
  }

  @Post("zonas")
  async crearZona(@Body(new ZodValidationPipe(zonaSchema)) dto: ZonaDto) {
    this.catalogos.validarTexto(dto.nombre, "nombre");
    return this.catalogos.protegerCodigoDuplicado(dto.codigo, async () => {
      const [creada] = await this.db.insert(zonas).values(dto).returning();
      return creada;
    });
  }

  @Patch("zonas/:id")
  async editarZona(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zonaSchema.partial())) dto: Partial<ZonaDto>,
  ) {
    if (dto.nombre) this.catalogos.validarTexto(dto.nombre, "nombre");
    const { codigo: _ignorado, ...cambios } = dto;

    const [actualizada] = await this.db
      .update(zonas)
      .set({ ...cambios, actualizadoEn: new Date() })
      .where(eq(zonas.id, id))
      .returning();
    return actualizada;
  }

  // ── Común ──────────────────────────────────────────────────────────

  /**
   * Activa o desactiva cualquier elemento de catálogo.
   *
   * No hay endpoint de borrado, y es deliberado: borrar de verdad rompería el
   * histórico de visitas que referencian el elemento.
   */
  @Patch(":tipo/:id/activo")
  async cambiarActivo(
    @Param("tipo") tipo: TipoCatalogo,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(activoSchema)) dto: ActivoDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    return this.catalogos.cambiarActivo(tipo, id, dto.activo, usuario);
  }
}
