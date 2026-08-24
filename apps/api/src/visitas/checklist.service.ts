import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  fotos,
  itemsChecklist,
  plantillasChecklist,
  resultadosChecklist,
  tiendas,
  visitas,
} from "@sw/db";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";

@Injectable()
export class ChecklistService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Checklist de una visita, con el estado actual de cada ítem.
   *
   * MATERIALIZA los resultados que falten, y eso resuelve un orden imposible:
   * una foto de ítem necesita `resultadoChecklistId` para asociarse, pero ese
   * resultado no existiría hasta marcar el ítem — y marcar un ítem que exige
   * foto requiere que la foto ya esté. Creando las filas vacías al abrir el
   * checklist, el ciclo se rompe: existe el destino antes de que haya nada que
   * guardar en él.
   */
  async delaVisita(visitaId: string, usuario: PayloadToken) {
    const { visita, tienda } = await this.visitaPropia(visitaId, usuario);
    const plantillaId = await this.plantillaAplicable(tienda.tipoTiendaId);

    if (!plantillaId) {
      return { visitaId, editable: this.esEditable(visita.estado), items: [] };
    }

    await this.materializarResultados(visitaId, plantillaId);

    const filas = await this.db
      .select({
        item: itemsChecklist,
        resultado: resultadosChecklist,
        /**
         * Cuenta solo fotos CONFIRMADAS: una reserva cuya subida no terminó no
         * satisface el requisito de fotografía.
         */
        fotosConfirmadas: sql<number>`(
          select count(*)::int from ${fotos}
          where ${fotos.resultadoChecklistId} = ${resultadosChecklist.id}
            and ${fotos.confirmadaEn} is not null
        )`,
      })
      .from(itemsChecklist)
      .leftJoin(
        resultadosChecklist,
        and(
          eq(resultadosChecklist.itemId, itemsChecklist.id),
          eq(resultadosChecklist.visitaId, visitaId),
        ),
      )
      .where(
        and(
          eq(itemsChecklist.plantillaId, plantillaId),
          eq(itemsChecklist.activo, true),
        ),
      )
      .orderBy(asc(itemsChecklist.orden));

    return {
      visitaId,
      editable: this.esEditable(visita.estado),
      items: filas.map((f) => ({
        itemId: f.item.id,
        resultadoId: f.resultado?.id ?? null,
        texto: f.item.texto,
        requiereFoto: f.item.requiereFoto,
        obligatorio: f.item.obligatorio,
        orden: f.item.orden,
        completado: f.resultado?.completado ?? false,
        completadoEn: f.resultado?.completadoEn ?? null,
        fotos: f.fotosConfirmadas,
        /** La app puede deshabilitar el interruptor en vez de dejar fallar. */
        puedeCompletarse: !f.item.requiereFoto || f.fotosConfirmadas > 0,
      })),
    };
  }

  /**
   * Marca o desmarca un ítem.
   *
   * Desmarcar se permite mientras la visita siga en curso: el comercial puede
   * equivocarse de fila en una lista de nueve ítems mirando el móvil en un
   * pasillo, y obligarle a cerrar la visita mal por un toque erróneo sería
   * absurdo. Al cerrar la visita, el estado queda congelado.
   */
  async marcar(
    visitaId: string,
    itemId: string,
    completado: boolean,
    usuario: PayloadToken,
    capturadaEn?: Date,
  ) {
    const { visita, tienda } = await this.visitaPropia(visitaId, usuario);

    if (!this.esEditable(visita.estado)) {
      throw new ConflictException(
        `La visita está en estado "${visita.estado}" y su checklist ya no se puede modificar`,
      );
    }

    const [item] = await this.db
      .select()
      .from(itemsChecklist)
      .where(and(eq(itemsChecklist.id, itemId), eq(itemsChecklist.activo, true)))
      .limit(1);

    if (!item) throw new NotFoundException("Ítem de checklist no encontrado");

    const plantillaId = await this.plantillaAplicable(tienda.tipoTiendaId);
    if (item.plantillaId !== plantillaId) {
      throw new ConflictException(
        "Ese ítem no pertenece al checklist de esta tienda",
      );
    }

    await this.materializarResultados(visitaId, plantillaId!);

    const [resultado] = await this.db
      .select()
      .from(resultadosChecklist)
      .where(
        and(
          eq(resultadosChecklist.visitaId, visitaId),
          eq(resultadosChecklist.itemId, itemId),
        ),
      )
      .limit(1);

    if (!resultado) throw new NotFoundException("Resultado no encontrado");

    /**
     * Un ítem que exige fotografía no se puede marcar sin una foto confirmada
     * (SPECS §5.4). Se comprueba en servidor y no solo en la app: la cola
     * offline envía operaciones que se prepararon hace horas, y el estado que
     * el dispositivo creía tener pudo cambiar.
     */
    if (completado && item.requiereFoto) {
      const [conteo] = await this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(fotos)
        .where(
          and(
            eq(fotos.resultadoChecklistId, resultado.id),
            isNotNull(fotos.confirmadaEn),
          ),
        );

      if (!conteo || conteo.total === 0) {
        throw new ConflictException(
          "Este ítem exige una fotografía. Adjúntala antes de marcarlo.",
        );
      }
    }

    const [actualizado] = await this.db
      .update(resultadosChecklist)
      .set({
        completado,
        completadoEn: completado ? (capturadaEn ?? new Date()) : null,
      })
      .where(eq(resultadosChecklist.id, resultado.id))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: completado ? "checklist.item_completado" : "checklist.item_desmarcado",
      entidad: "resultado_checklist",
      entidadId: resultado.id,
      cambios: {
        completado: { antes: resultado.completado, despues: completado },
      },
    });

    return actualizado!;
  }

  /**
   * Plantilla que aplica a un tipo de tienda, con respaldo a la global.
   *
   * Sin el respaldo, una tienda de tipo nuevo se quedaría sin checklist y
   * cualquier visita a ella parecería completa: peor que no tener checklist es
   * tener uno vacío que da la visita por buena.
   */
  private async plantillaAplicable(tipoTiendaId: string | null) {
    const [plantilla] = await this.db
      .select({ id: plantillasChecklist.id })
      .from(plantillasChecklist)
      .where(
        and(
          eq(plantillasChecklist.activo, true),
          tipoTiendaId
            ? or(
                eq(plantillasChecklist.tipoTiendaId, tipoTiendaId),
                isNull(plantillasChecklist.tipoTiendaId),
              )
            : isNull(plantillasChecklist.tipoTiendaId),
        ),
      )
      // La específica del tipo gana sobre la global.
      .orderBy(sql`${plantillasChecklist.tipoTiendaId} nulls last`)
      .limit(1);

    return plantilla?.id ?? null;
  }

  /** Crea las filas de resultado que falten. Idempotente por `NOT EXISTS`. */
  private async materializarResultados(visitaId: string, plantillaId: string) {
    const faltantes = await this.db
      .select({ id: itemsChecklist.id })
      .from(itemsChecklist)
      .where(
        and(
          eq(itemsChecklist.plantillaId, plantillaId),
          eq(itemsChecklist.activo, true),
          sql`not exists (
            select 1 from ${resultadosChecklist}
            where ${resultadosChecklist.itemId} = ${itemsChecklist.id}
              and ${resultadosChecklist.visitaId} = ${visitaId}
          )`,
        ),
      );

    if (faltantes.length === 0) return;

    await this.db
      .insert(resultadosChecklist)
      .values(
        faltantes.map((i) => ({ visitaId, itemId: i.id, completado: false })),
      )
      .onConflictDoNothing();
  }

  /** El checklist solo se edita con la visita abierta. */
  private esEditable(estado: string) {
    return estado === "pendiente" || estado === "en_curso";
  }

  private async visitaPropia(visitaId: string, usuario: PayloadToken) {
    const [fila] = await this.db
      .select({ visita: visitas, tienda: tiendas })
      .from(visitas)
      .innerJoin(tiendas, eq(tiendas.id, visitas.tiendaId))
      .where(eq(visitas.id, visitaId))
      .limit(1);

    if (!fila) throw new NotFoundException("Visita no encontrada");

    /** Supervisores y administradores consultan, pero no editan. */
    if (usuario.rol === "comercial" && fila.visita.usuarioId !== usuario.sub) {
      throw new ForbiddenException("Esta visita no es tuya");
    }
    return fila;
  }
}
