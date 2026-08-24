import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { rutasDiarias, tiendas, usuarios, visitas } from "@sw/db";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";
import {
  consultarRutaSchema,
  planificarSchema,
  type ConsultarRutaDto,
  type PlanificarDto,
} from "./dto/rutas.dto";

/**
 * Planificación de rutas (SPECS §6.1).
 *
 * Asignación manual. Sin franjas horarias: el comercial organiza su jornada
 * como quiera y solo importa que las visitas se hagan durante el día. El orden
 * es sugerido y no se valida ni se penaliza.
 */
@Roles("supervisor", "administrador")
@Controller("rutas")
export class RutasController {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  async consultar(
    @Query(new ZodValidationPipe(consultarRutaSchema)) query: ConsultarRutaDto,
    @UsuarioActual() actual: PayloadToken,
  ) {
    const condiciones = [eq(rutasDiarias.fecha, query.fecha)];
    if (query.usuarioId) condiciones.push(eq(rutasDiarias.usuarioId, query.usuarioId));

    const filas = await this.db
      .select({
        ruta: rutasDiarias,
        tienda: {
          id: tiendas.id,
          nombre: tiendas.nombre,
          numeroReferencia: tiendas.numeroReferencia,
          zonaId: tiendas.zonaId,
        },
        comercial: {
          id: usuarios.id,
          nombre: usuarios.nombre,
          numeroTrabajador: usuarios.numeroTrabajador,
          zonaId: usuarios.zonaId,
        },
        estadoVisita: visitas.estado,
      })
      .from(rutasDiarias)
      .innerJoin(tiendas, eq(tiendas.id, rutasDiarias.tiendaId))
      .innerJoin(usuarios, eq(usuarios.id, rutasDiarias.usuarioId))
      .leftJoin(visitas, eq(visitas.rutaDiariaId, rutasDiarias.id))
      .where(and(...condiciones))
      .orderBy(asc(usuarios.numeroTrabajador), asc(rutasDiarias.ordenSugerido));

    /** Un supervisor solo ve su zona. */
    return actual.rol === "supervisor"
      ? filas.filter((f) => f.comercial.zonaId === actual.zonaId)
      : filas;
  }

  /**
   * Asigna la ruta de un comercial para una fecha.
   *
   * Sustituye la ruta completa de ese día en lugar de añadir: el planificador
   * del backoffice trabaja sobre la lista entera, y una semántica de "añadir"
   * haría imposible quitar una tienda sin un endpoint más.
   *
   * CREA TAMBIÉN LAS VISITAS. Sin fila en `visitas` el comercial no puede
   * justificar una tienda a la que no ha ido, y la vista del día tendría que
   * materializarlas sobre la marcha. Creándolas aquí, quedan desde el momento
   * en que se planifica.
   */
  @Post()
  async planificar(
    @Body(new ZodValidationPipe(planificarSchema)) dto: PlanificarDto,
    @UsuarioActual() actual: PayloadToken,
  ) {
    const [comercial] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, dto.usuarioId))
      .limit(1);

    if (!comercial) throw new BadRequestException("Comercial no encontrado");
    if (comercial.rol !== "comercial") {
      throw new BadRequestException("Solo se asignan rutas a comerciales");
    }
    if (!comercial.activo) {
      throw new BadRequestException("El comercial está dado de baja");
    }
    if (actual.rol === "supervisor" && comercial.zonaId !== actual.zonaId) {
      throw new ConflictException("Ese comercial no es de tu zona");
    }

    /** Duplicados en la lista dejarían dos tarjetas de la misma tienda. */
    const unicas = [...new Set(dto.tiendaIds)];
    if (unicas.length !== dto.tiendaIds.length) {
      throw new BadRequestException(
        "La ruta tiene tiendas repetidas; cada tienda se visita una vez al día",
      );
    }

    if (unicas.length > 0) {
      const activas = await this.db
        .select({ id: tiendas.id })
        .from(tiendas)
        .where(and(inArray(tiendas.id, unicas), eq(tiendas.activo, true)));

      if (activas.length !== unicas.length) {
        throw new BadRequestException(
          "La ruta incluye tiendas inexistentes o dadas de baja",
        );
      }
    }

    return this.db.transaction(async (tx) => {
      const rutasPrevias = await tx
        .select({ id: rutasDiarias.id })
        .from(rutasDiarias)
        .where(
          and(
            eq(rutasDiarias.usuarioId, dto.usuarioId),
            eq(rutasDiarias.fecha, dto.fecha),
          ),
        );

      if (rutasPrevias.length > 0) {
        const ids = rutasPrevias.map((r) => r.id);

        /**
         * Solo se pueden quitar tiendas cuya visita no haya empezado. Borrar
         * una ruta cuyo comercial ya está dentro de la tienda destruiría un
         * registro de actividad real.
         */
        const enMarcha = await tx
          .select({ id: visitas.id })
          .from(visitas)
          .where(
            and(
              inArray(visitas.rutaDiariaId, ids),
              inArray(visitas.estado, ["en_curso", "finalizada", "no_realizada"]),
            ),
          );

        if (enMarcha.length > 0) {
          throw new ConflictException(
            "No se puede replanificar: hay visitas de esa jornada ya iniciadas o cerradas",
          );
        }

        await tx.delete(visitas).where(inArray(visitas.rutaDiariaId, ids));
        await tx.delete(rutasDiarias).where(inArray(rutasDiarias.id, ids));
      }

      const creadas = [];
      for (const [indice, tiendaId] of unicas.entries()) {
        const [ruta] = await tx
          .insert(rutasDiarias)
          .values({
            usuarioId: dto.usuarioId,
            tiendaId,
            fecha: dto.fecha,
            ordenSugerido: indice + 1,
          })
          .returning();

        await tx.insert(visitas).values({
          usuarioId: dto.usuarioId,
          tiendaId,
          rutaDiariaId: ruta!.id,
          fecha: dto.fecha,
          estado: "pendiente",
          planificada: true,
        });

        creadas.push(ruta!);
      }

      await this.auditoria.registrar({
        usuarioId: actual.sub,
        numeroTrabajador: actual.numeroTrabajador,
        accion: "ruta.planificada",
        entidad: "ruta_diaria",
        cambios: {
          comercial: { antes: null, despues: comercial.numeroTrabajador },
          fecha: { antes: null, despues: dto.fecha },
          tiendas: { antes: rutasPrevias.length, despues: unicas.length },
        },
      });

      return { fecha: dto.fecha, asignadas: creadas.length, rutas: creadas };
    });
  }
}
