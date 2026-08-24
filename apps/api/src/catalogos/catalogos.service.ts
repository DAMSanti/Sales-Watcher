import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  categorias,
  motivosNoRealizacion,
  tiposTienda,
  zonas,
} from "@sw/db";
import { idiomasFaltantes, type Idioma, type TextoI18n } from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";

/**
 * Los cuatro catálogos configurables comparten forma: código estable, texto
 * traducible, `activo` y orden. Este servicio concentra lo común —listar,
 * desactivar, reordenar, informar de traducciones faltantes— y deja a cada
 * controlador solo sus campos propios.
 *
 * REGLA QUE ATRAVIESA TODO EL FICHERO: los catálogos **se desactivan, nunca se
 * borran**. Un borrado real rompería el histórico de visitas que los
 * referencia, y una incidencia sin categoría no se puede leer ni contar.
 */

export type TipoCatalogo = "categorias" | "motivos" | "tipos-tienda" | "zonas";

const TABLAS = {
  categorias: { tabla: categorias, columnaTexto: "nombre" as const },
  motivos: { tabla: motivosNoRealizacion, columnaTexto: "texto" as const },
  "tipos-tienda": { tabla: tiposTienda, columnaTexto: "nombre" as const },
  zonas: { tabla: zonas, columnaTexto: "nombre" as const },
};

@Injectable()
export class CatalogosService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Estado de traducción de todos los catálogos.
   *
   * Es lo que evita que los idiomas minoritarios se degraden por acumulación
   * (P16): sin un sitio donde ver qué falta, una categoría creada en
   * castellano seis meses después del rollout sale en el idioma de respaldo
   * para todos los demás y nadie se entera hasta que un comercial vasco la ve
   * en castellano.
   */
  async estadoTraducciones() {
    const resumen: Record<string, unknown> = {};

    for (const [nombre, { tabla, columnaTexto }] of Object.entries(TABLAS)) {
      const filas = await this.db.select().from(tabla as PgTable);
      const incompletos = filas
        .map((f) => {
          const registro = f as Record<string, unknown>;
          const faltan = idiomasFaltantes(registro[columnaTexto] as TextoI18n);
          return faltan.length
            ? {
                id: registro.id as string,
                codigo: registro.codigo as string | undefined,
                faltan,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      resumen[nombre] = {
        total: filas.length,
        completos: filas.length - incompletos.length,
        incompletos,
      };
    }

    return resumen;
  }

  /**
   * Activa o desactiva un elemento de catálogo.
   *
   * Desactivar lo saca de los desplegables del comercial pero lo deja legible
   * en el histórico. Es la única forma de "borrar" que admite el sistema.
   */
  async cambiarActivo(
    tipo: TipoCatalogo,
    id: string,
    activo: boolean,
    usuario: PayloadToken,
  ) {
    /**
     * `switch` explícito en lugar de una tabla dinámica: Drizzle pierde los
     * tipos al indexar tablas por variable, y los casts que haría falta poner
     * para silenciarlo esconderían cualquier error de columna hasta ejecución.
     */
    const marcas = { activo, actualizadoEn: new Date() };
    const actualizado = await (async () => {
      switch (tipo) {
        case "categorias":
          return (
            await this.db
              .update(categorias)
              .set(marcas)
              .where(eq(categorias.id, id))
              .returning()
          )[0];
        case "motivos":
          return (
            await this.db
              .update(motivosNoRealizacion)
              .set(marcas)
              .where(eq(motivosNoRealizacion.id, id))
              .returning()
          )[0];
        case "tipos-tienda":
          return (
            await this.db
              .update(tiposTienda)
              .set(marcas)
              .where(eq(tiposTienda.id, id))
              .returning()
          )[0];
        case "zonas":
          return (
            await this.db
              .update(zonas)
              .set(marcas)
              .where(eq(zonas.id, id))
              .returning()
          )[0];
      }
    })();

    if (!actualizado) throw new NotFoundException("Elemento no encontrado");

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: activo ? "catalogo.activado" : "catalogo.desactivado",
      entidad: tipo,
      entidadId: id,
      cambios: { activo: { antes: !activo, despues: activo } },
    });

    return actualizado;
  }

  /**
   * Comprueba que un texto traducible trae al menos el idioma por defecto.
   *
   * No se exigen los cinco: obligar a traducirlo todo de golpe bloquearía al
   * administrador que necesita dar de alta una categoría hoy porque el cliente
   * la pidió esta mañana. Lo que falte queda visible en el estado de
   * traducciones para completarlo después.
   */
  validarTexto(texto: TextoI18n, campo = "texto"): TextoI18n {
    if (!texto.es || texto.es.trim() === "") {
      throw new BadRequestException(
        `El campo "${campo}" necesita al menos la versión en castellano`,
      );
    }
    return texto;
  }

  /** Traduce la violación de código duplicado a un mensaje legible. */
  async protegerCodigoDuplicado<T>(codigo: string, operacion: () => Promise<T>) {
    try {
      return await operacion();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (mensaje.includes("duplicate key") || mensaje.includes("unique")) {
        throw new ConflictException(`Ya existe un elemento con el código "${codigo}"`);
      }
      throw error;
    }
  }
}
