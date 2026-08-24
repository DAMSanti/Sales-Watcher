import { hash } from "@node-rs/argon2";
import {
  BadRequestException,
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
  Query,
} from "@nestjs/common";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { usuarios, zonas } from "@sw/db";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { Roles } from "../auth/decoradores/roles.decorator";
import { UsuarioActual } from "../auth/decoradores/usuario-actual.decorator";
import { ZodValidationPipe } from "../comun/zod-validation.pipe";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";
import {
  buscarUsuariosSchema,
  crearUsuarioSchema,
  editarUsuarioSchema,
  type BuscarUsuariosDto,
  type CrearUsuarioDto,
  type EditarUsuarioDto,
} from "./dto/usuarios.dto";

/**
 * Gestión de usuarios (SPECS §6.1).
 *
 * La regeneración de contraseña vive en `/auth/password/regenerar` y la puede
 * ejecutar también un supervisor: el comercial en tienda necesita que alguien
 * accesible pueda desbloquearle. El resto de la gestión es solo de
 * administrador.
 *
 * Nunca se devuelve `passwordHash` en ninguna respuesta.
 */
@Controller("usuarios")
export class UsuariosController {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Campos que sí pueden salir de la API. */
  private get camposPublicos() {
    return {
      id: usuarios.id,
      numeroTrabajador: usuarios.numeroTrabajador,
      nombre: usuarios.nombre,
      email: usuarios.email,
      rol: usuarios.rol,
      zonaId: usuarios.zonaId,
      idiomaPreferido: usuarios.idiomaPreferido,
      activo: usuarios.activo,
      requiereCambioPassword: usuarios.requiereCambioPassword,
      bloqueadoHasta: usuarios.bloqueadoHasta,
      ultimoAccesoEn: usuarios.ultimoAccesoEn,
      creadoEn: usuarios.creadoEn,
    };
  }

  @Roles("supervisor", "administrador")
  @Get()
  async buscar(
    @Query(new ZodValidationPipe(buscarUsuariosSchema)) query: BuscarUsuariosDto,
    @UsuarioActual() actual: PayloadToken,
  ) {
    const condiciones = [];

    /**
     * Un supervisor solo ve su equipo. Sin este filtro tendría delante la
     * plantilla entera, incluidos otros supervisores y administradores.
     */
    if (actual.rol === "supervisor") {
      if (!actual.zonaId) return { total: 0, usuarios: [] };
      condiciones.push(eq(usuarios.zonaId, actual.zonaId));
      condiciones.push(eq(usuarios.rol, "comercial"));
    } else {
      if (query.zonaId) condiciones.push(eq(usuarios.zonaId, query.zonaId));
      if (query.rol) condiciones.push(eq(usuarios.rol, query.rol));
    }

    if (!query.incluirInactivos) condiciones.push(eq(usuarios.activo, true));
    if (query.texto) {
      const patron = `%${query.texto}%`;
      condiciones.push(
        or(ilike(usuarios.nombre, patron), ilike(usuarios.numeroTrabajador, patron))!,
      );
    }

    const filtro = condiciones.length ? and(...condiciones) : undefined;

    const [filas, conteo] = await Promise.all([
      this.db
        .select({ ...this.camposPublicos, zonaCodigo: zonas.codigo })
        .from(usuarios)
        .leftJoin(zonas, eq(zonas.id, usuarios.zonaId))
        .where(filtro)
        .orderBy(asc(usuarios.numeroTrabajador))
        .limit(query.limite)
        .offset(query.desplazamiento),
      this.db.select({ total: sql<number>`count(*)::int` }).from(usuarios).where(filtro),
    ]);

    return { total: conteo[0]?.total ?? 0, usuarios: filas };
  }

  /**
   * Alta de usuario.
   *
   * La contraseña inicial se genera y se devuelve UNA vez, igual que en la
   * regeneración, y fuerza cambio en el primer acceso. No se acepta una
   * contraseña elegida por el administrador: acabaría siendo la misma para
   * toda la plantilla.
   */
  @Roles("administrador")
  @Post()
  async crear(
    @Body(new ZodValidationPipe(crearUsuarioSchema)) dto: CrearUsuarioDto,
    @UsuarioActual() actual: PayloadToken,
  ) {
    const [existente] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.numeroTrabajador, dto.numeroTrabajador))
      .limit(1);

    if (existente) {
      throw new ConflictException(
        `Ya existe un usuario con el número de trabajador ${dto.numeroTrabajador}`,
      );
    }

    /**
     * Un comercial sin zona no tendría ruta, ni zona horaria para el cierre de
     * jornada, ni aparecería en la bandeja de ningún supervisor. Es un usuario
     * invisible, así que se exige aquí en lugar de dejarlo pasar.
     */
    if (dto.rol === "comercial" && !dto.zonaId) {
      throw new BadRequestException("Un comercial necesita zona asignada");
    }

    const temporal = generarPasswordTemporal();

    const [creado] = await this.db
      .insert(usuarios)
      .values({
        ...dto,
        email: dto.email ?? null,
        zonaId: dto.zonaId ?? null,
        passwordHash: await hash(temporal),
        requiereCambioPassword: true,
      })
      .returning(this.camposPublicos);

    await this.auditoria.registrar({
      usuarioId: actual.sub,
      numeroTrabajador: actual.numeroTrabajador,
      accion: "usuario.creado",
      entidad: "usuario",
      entidadId: creado!.id,
      cambios: {
        numeroTrabajador: { antes: null, despues: dto.numeroTrabajador },
        rol: { antes: null, despues: dto.rol },
      },
    });

    return { usuario: creado, passwordTemporal: temporal };
  }

  @Roles("administrador")
  @Patch(":id")
  async editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarUsuarioSchema)) dto: EditarUsuarioDto,
    @UsuarioActual() actual: PayloadToken,
  ) {
    const [anterior] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);

    if (!anterior) throw new NotFoundException("Usuario no encontrado");

    /**
     * Un administrador no puede desactivarse ni degradarse a sí mismo. Con un
     * solo administrador en el sistema, cualquiera de las dos cosas dejaría la
     * instalación sin nadie capaz de gestionarla.
     */
    if (id === actual.sub) {
      if (dto.activo === false) {
        throw new ConflictException("No puedes desactivar tu propia cuenta");
      }
      if (dto.rol && dto.rol !== "administrador") {
        throw new ConflictException("No puedes cambiar tu propio rol");
      }
    }

    const [actualizado] = await this.db
      .update(usuarios)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(usuarios.id, id))
      .returning(this.camposPublicos);

    await this.auditoria.registrar({
      usuarioId: actual.sub,
      numeroTrabajador: actual.numeroTrabajador,
      accion: "usuario.editado",
      entidad: "usuario",
      entidadId: id,
      cambios: {
        ...(dto.rol && dto.rol !== anterior.rol
          ? { rol: { antes: anterior.rol, despues: dto.rol } }
          : {}),
        ...(dto.activo !== undefined && dto.activo !== anterior.activo
          ? { activo: { antes: anterior.activo, despues: dto.activo } }
          : {}),
      },
    });

    return actualizado;
  }

  /**
   * Desbloquea una cuenta antes de que expire el bloqueo temporal.
   *
   * Lo puede hacer un supervisor: el comercial bloqueado a media mañana no
   * debería esperar quince minutos parado en la calle si tiene a alguien
   * accesible que pueda desbloquearle.
   */
  @Roles("supervisor", "administrador")
  @Post(":id/desbloquear")
  async desbloquear(
    @Param("id", ParseUUIDPipe) id: string,
    @UsuarioActual() actual: PayloadToken,
  ) {
    const [actualizado] = await this.db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id))
      .returning(this.camposPublicos);

    if (!actualizado) throw new NotFoundException("Usuario no encontrado");

    await this.auditoria.registrar({
      usuarioId: actual.sub,
      numeroTrabajador: actual.numeroTrabajador,
      accion: "usuario.desbloqueado",
      entidad: "usuario",
      entidadId: id,
    });

    return actualizado;
  }
}

/**
 * Contraseña temporal legible por teléfono.
 *
 * Sin caracteres que se confundan al oído o a la vista (0/O, 1/l/I) y agrupada
 * en bloques: el administrador se la va a dictar. Una cadena "más segura" pero
 * indictable acabaría apuntada en un papel, que es peor.
 */
function generarPasswordTemporal(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloque = () =>
    Array.from(
      crypto.getRandomValues(new Uint8Array(4)),
      (b) => alfabeto[b % alfabeto.length],
    ).join("");
  return `${bloque()}-${bloque()}-${bloque()}`;
}
