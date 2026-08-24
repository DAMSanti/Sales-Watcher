import { hash, verify } from "@node-rs/argon2";
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import { usuarios } from "@sw/db";
import type { Idioma } from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { Configuracion } from "../config/configuracion";

export type PayloadToken = {
  /** Identificador del usuario. */
  sub: string;
  numeroTrabajador: string;
  rol: "comercial" | "supervisor" | "administrador";
  zonaId: string | null;
  idioma: Idioma;
  /** Si es true, todos los endpoints salvo el cambio de contraseña quedan vetados. */
  requiereCambioPassword: boolean;
  /** Emisión, en segundos. Se compara con `passwordCambiadoEn` para invalidar. */
  iat?: number;
  exp?: number;
};

export type ContextoPeticion = {
  ip?: string | undefined;
  agenteUsuario?: string | undefined;
};

/**
 * Hash de descarte usado cuando el número de trabajador no existe.
 *
 * Sin esto, un login con usuario inexistente respondería mucho más rápido que
 * uno con contraseña incorrecta, porque no llegaría a verificar el hash. Esa
 * diferencia de tiempo permite enumerar qué números de trabajador son válidos.
 * Verificando siempre contra algo, ambas ramas cuestan lo mismo.
 */
const HASH_DESCARTE =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsZXN3YXRjaGVyZHVtbXk$8s1Zb1cFPQqk1Y5vJZ0PbLZ7hQxV3nKqR2mYt4wXcAo";

@Injectable()
export class AuthService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Configuracion, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Autentica con número de trabajador y contraseña.
   *
   * Todos los fallos devuelven el mismo mensaje genérico salvo el bloqueo, que
   * sí se comunica: si no, el comercial bloqueado seguiría reintentando sin
   * entender por qué no entra, y acabaría llamando al supervisor por un
   * problema que se resuelve esperando.
   */
  async login(
    numeroTrabajador: string,
    password: string,
    contexto: ContextoPeticion = {},
  ) {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.numeroTrabajador, numeroTrabajador))
      .limit(1);

    const ahora = new Date();

    if (usuario?.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
      const minutos = Math.ceil(
        (usuario.bloqueadoHasta.getTime() - ahora.getTime()) / 60_000,
      );
      await this.auditoria.registrar({
        usuarioId: usuario.id,
        numeroTrabajador,
        accion: "auth.login.bloqueado",
        entidad: "usuario",
        entidadId: usuario.id,
        ...contexto,
      });
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente. Vuelve a intentarlo en ${minutos} minuto(s).`,
      );
    }

    // Se verifica siempre, exista el usuario o no, para igualar los tiempos.
    const passwordValida = await verify(
      usuario?.passwordHash ?? HASH_DESCARTE,
      password,
    ).catch(() => false);

    if (!usuario || !usuario.activo || !passwordValida) {
      if (usuario && usuario.activo) {
        await this.registrarIntentoFallido(usuario.id, usuario.intentosFallidos);
      }
      await this.auditoria.registrar({
        usuarioId: usuario?.id ?? null,
        numeroTrabajador,
        accion: "auth.login.fallido",
        entidad: "usuario",
        entidadId: usuario?.id ?? null,
        ...contexto,
      });
      throw new UnauthorizedException("Número de trabajador o contraseña incorrectos");
    }

    await this.db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null, ultimoAccesoEn: ahora })
      .where(eq(usuarios.id, usuario.id));

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      numeroTrabajador,
      accion: "auth.login.correcto",
      entidad: "usuario",
      entidadId: usuario.id,
      ...contexto,
    });

    return {
      token: await this.emitirToken(usuario),
      usuario: this.perfilPublico(usuario),
      /**
       * La PWA usa esto para llevar al usuario directamente a la pantalla de
       * cambio de contraseña en lugar de a la vista del día.
       */
      requiereCambioPassword: usuario.requiereCambioPassword,
    };
  }

  /**
   * Cambio de contraseña por el propio usuario.
   *
   * Exige la contraseña actual aunque venga de un forzado por regeneración:
   * quien tenga el token pero no la contraseña temporal no debe poder fijar
   * una nueva y quedarse con la cuenta.
   */
  async cambiarPassword(
    usuarioId: string,
    passwordActual: string,
    passwordNueva: string,
    contexto: ContextoPeticion = {},
  ) {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException("Usuario no válido");
    }

    const correcta = await verify(usuario.passwordHash, passwordActual).catch(
      () => false,
    );
    if (!correcta) {
      await this.auditoria.registrar({
        usuarioId: usuario.id,
        numeroTrabajador: usuario.numeroTrabajador,
        accion: "auth.password.cambio_fallido",
        entidad: "usuario",
        entidadId: usuario.id,
        ...contexto,
      });
      throw new UnauthorizedException("La contraseña actual no es correcta");
    }

    if (await verify(usuario.passwordHash, passwordNueva).catch(() => false)) {
      throw new ForbiddenException("La nueva contraseña debe ser distinta de la actual");
    }

    const ahora = new Date();
    await this.db
      .update(usuarios)
      .set({
        passwordHash: await hash(passwordNueva),
        requiereCambioPassword: false,
        // Invalida todos los tokens emitidos antes de este instante.
        passwordCambiadoEn: ahora,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      })
      .where(eq(usuarios.id, usuario.id));

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "auth.password.cambiada",
      entidad: "usuario",
      entidadId: usuario.id,
      ...contexto,
    });

    // Se emite un token nuevo: el anterior acaba de quedar invalidado y, sin
    // esto, cambiar la contraseña expulsaría al usuario de su propia sesión.
    const [actualizado] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, usuario.id))
      .limit(1);

    return {
      token: await this.emitirToken(actualizado!),
      usuario: this.perfilPublico(actualizado!),
    };
  }

  /**
   * Regeneración de contraseña por un administrador o supervisor.
   *
   * No hay auto-servicio por email: el comercial en tienda no siempre tiene
   * acceso a su correo corporativo (ANEXO, decisión que cierra P8). La
   * contraseña generada es temporal y fuerza cambio en el siguiente acceso.
   */
  async regenerarPassword(
    usuarioObjetivoId: string,
    ejecutorId: string,
    contexto: ContextoPeticion = {},
  ) {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, usuarioObjetivoId))
      .limit(1);

    if (!usuario) throw new UnauthorizedException("Usuario no encontrado");

    const temporal = generarPasswordTemporal();
    const ahora = new Date();

    await this.db
      .update(usuarios)
      .set({
        passwordHash: await hash(temporal),
        requiereCambioPassword: true,
        // Mata las sesiones abiertas. Es el caso del móvil perdido: sin esto,
        // regenerar la contraseña no cerraría la sesión que sigue viva en él.
        passwordCambiadoEn: ahora,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      })
      .where(eq(usuarios.id, usuario.id));

    await this.auditoria.registrar({
      usuarioId: ejecutorId,
      accion: "auth.password.regenerada",
      entidad: "usuario",
      entidadId: usuario.id,
      cambios: {
        objetivo: { antes: usuario.numeroTrabajador, despues: usuario.numeroTrabajador },
      },
      ...contexto,
    });

    /**
     * La contraseña temporal se devuelve UNA sola vez, en esta respuesta, para
     * que el administrador se la comunique al comercial. No se almacena en
     * claro ni se puede volver a consultar.
     */
    return { passwordTemporal: temporal };
  }

  /** Datos del usuario que sí pueden salir de la API. Nunca el hash. */
  private perfilPublico(usuario: typeof usuarios.$inferSelect) {
    return {
      id: usuario.id,
      numeroTrabajador: usuario.numeroTrabajador,
      nombre: usuario.nombre,
      rol: usuario.rol,
      zonaId: usuario.zonaId,
      idiomaPreferido: usuario.idiomaPreferido,
    };
  }

  private async emitirToken(usuario: typeof usuarios.$inferSelect) {
    const payload: Omit<PayloadToken, "iat" | "exp"> = {
      sub: usuario.id,
      numeroTrabajador: usuario.numeroTrabajador,
      rol: usuario.rol,
      zonaId: usuario.zonaId,
      idioma: usuario.idiomaPreferido,
      requiereCambioPassword: usuario.requiereCambioPassword,
    };
    return this.jwt.signAsync(payload);
  }

  /**
   * Suma un intento fallido y bloquea al alcanzar el máximo.
   *
   * El bloqueo es temporal y el contador se reinicia con cada login correcto,
   * así que un comercial que se equivoca dos veces hoy y dos mañana nunca
   * llega al límite.
   */
  private async registrarIntentoFallido(usuarioId: string, intentosPrevios: number) {
    const maximo = this.config.get("AUTH_MAX_INTENTOS", { infer: true });
    const minutos = this.config.get("AUTH_BLOQUEO_MINUTOS", { infer: true });
    const intentos = intentosPrevios + 1;

    await this.db
      .update(usuarios)
      .set({
        intentosFallidos: intentos,
        bloqueadoHasta:
          intentos >= maximo ? new Date(Date.now() + minutos * 60_000) : null,
      })
      .where(eq(usuarios.id, usuarioId));
  }
}

/**
 * Contraseña temporal legible por teléfono.
 *
 * El administrador se la va a dictar al comercial, así que se excluyen los
 * caracteres que se confunden al oído o a la vista (0/O, 1/l/I) y se agrupa en
 * bloques. Una cadena aleatoria "más segura" pero indictable acabaría
 * apuntada en un papel, que es peor.
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
