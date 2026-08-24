import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { itemsChecklist, plantillasChecklist, tiposTienda } from "@sw/db";
import { idiomasFaltantes } from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";
import {
  itemSchema,
  plantillaSchema,
  reordenarSchema,
  type ItemDto,
  type PlantillaDto,
  type ReordenarDto,
} from "./dto/checklists.dto";

/**
 * Gestión de plantillas de checklist (SPECS §6.1).
 *
 * El checklist es configurable desde el backoffice y asignable por tipo de
 * tienda: un hipermercado no necesita las mismas comprobaciones que una tienda
 * de barrio, y un checklist genérico se acaba completando mecánicamente.
 */
@Roles("administrador")
@Controller("checklists")
export class ChecklistsController {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  async listar() {
    const plantillas = await this.db
      .select({
        plantilla: plantillasChecklist,
        tipoTienda: { id: tiposTienda.id, codigo: tiposTienda.codigo },
        numeroItems: sql<number>`(
          select count(*)::int from ${itemsChecklist}
          where ${itemsChecklist.plantillaId} = ${plantillasChecklist.id}
            and ${itemsChecklist.activo}
        )`,
      })
      .from(plantillasChecklist)
      .leftJoin(tiposTienda, eq(tiposTienda.id, plantillasChecklist.tipoTiendaId));

    return plantillas.map((p) => ({
      ...p.plantilla,
      tipoTienda: p.tipoTienda,
      numeroItems: p.numeroItems,
      /** Null = global; se marca explícitamente para la interfaz. */
      esGlobal: p.plantilla.tipoTiendaId === null,
      faltanIdiomas: idiomasFaltantes(p.plantilla.nombre),
    }));
  }

  @Get(":id/items")
  async items(@Param("id", ParseUUIDPipe) id: string) {
    const filas = await this.db
      .select()
      .from(itemsChecklist)
      .where(eq(itemsChecklist.plantillaId, id))
      .orderBy(asc(itemsChecklist.orden));

    return filas.map((i) => ({ ...i, faltanIdiomas: idiomasFaltantes(i.texto) }));
  }

  /**
   * Crea una plantilla.
   *
   * Solo puede haber una activa por tipo de tienda, y una global. Con dos
   * candidatas para el mismo tipo, la elección dependería del orden que
   * devolviera la base de datos, y dos visitas a la misma tienda podrían salir
   * con checklists distintos.
   */
  @Post()
  async crear(
    @Body(new ZodValidationPipe(plantillaSchema)) dto: PlantillaDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    const [conflicto] = await this.db
      .select({ id: plantillasChecklist.id })
      .from(plantillasChecklist)
      .where(
        and(
          eq(plantillasChecklist.activo, true),
          dto.tipoTiendaId
            ? eq(plantillasChecklist.tipoTiendaId, dto.tipoTiendaId)
            : isNull(plantillasChecklist.tipoTiendaId),
        ),
      )
      .limit(1);

    if (conflicto) {
      throw new ConflictException(
        dto.tipoTiendaId
          ? "Ya hay una plantilla activa para ese tipo de tienda"
          : "Ya hay una plantilla global activa",
      );
    }

    const [creada] = await this.db
      .insert(plantillasChecklist)
      .values({ nombre: dto.nombre, tipoTiendaId: dto.tipoTiendaId ?? null })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "checklist.plantilla_creada",
      entidad: "plantilla_checklist",
      entidadId: creada!.id,
    });

    return creada;
  }

  @Post(":id/items")
  async anadirItem(
    @Param("id", ParseUUIDPipe) plantillaId: string,
    @Body(new ZodValidationPipe(itemSchema)) dto: ItemDto,
    @UsuarioActual() usuario: PayloadToken,
  ) {
    const [plantilla] = await this.db
      .select({ id: plantillasChecklist.id })
      .from(plantillasChecklist)
      .where(eq(plantillasChecklist.id, plantillaId))
      .limit(1);

    if (!plantilla) throw new NotFoundException("Plantilla no encontrada");

    const [creado] = await this.db
      .insert(itemsChecklist)
      .values({ ...dto, plantillaId })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "checklist.item_creado",
      entidad: "item_checklist",
      entidadId: creado!.id,
    });

    return creado;
  }

  /**
   * Edita un ítem.
   *
   * Editar en vez de recrear conserva los resultados históricos que apuntan a
   * él. Corregir una errata no debe borrar lo que ya reportaron los
   * comerciales.
   */
  @Patch("items/:itemId")
  async editarItem(
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(itemSchema.partial())) dto: Partial<ItemDto>,
  ) {
    const [actualizado] = await this.db
      .update(itemsChecklist)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(itemsChecklist.id, itemId))
      .returning();

    if (!actualizado) throw new NotFoundException("Ítem no encontrado");
    return actualizado;
  }

  /**
   * Desactiva un ítem. No se borra: los resultados de visitas pasadas lo
   * referencian y quedarían huérfanos.
   */
  @Patch("items/:itemId/desactivar")
  async desactivarItem(@Param("itemId", ParseUUIDPipe) itemId: string) {
    const [actualizado] = await this.db
      .update(itemsChecklist)
      .set({ activo: false, actualizadoEn: new Date() })
      .where(eq(itemsChecklist.id, itemId))
      .returning();

    if (!actualizado) throw new NotFoundException("Ítem no encontrado");
    return actualizado;
  }

  /** Reordena los ítems de una plantilla en una sola operación. */
  @Post(":id/reordenar")
  async reordenar(
    @Param("id", ParseUUIDPipe) plantillaId: string,
    @Body(new ZodValidationPipe(reordenarSchema)) dto: ReordenarDto,
  ) {
    return this.db.transaction(async (tx) => {
      for (const [indice, itemId] of dto.items.entries()) {
        await tx
          .update(itemsChecklist)
          .set({ orden: indice, actualizadoEn: new Date() })
          .where(
            and(
              eq(itemsChecklist.id, itemId),
              // Acotado a la plantilla: un identificador de otra no debe colarse.
              eq(itemsChecklist.plantillaId, plantillaId),
            ),
          );
      }
      return { reordenados: dto.items.length };
    });
  }
}
