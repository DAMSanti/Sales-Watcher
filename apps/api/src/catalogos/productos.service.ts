import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { marcas, referenciasProducto } from "@sw/db";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";

/**
 * Catálogo de marcas y de referencias de producto.
 *
 * ── Por qué no llevan traducción ──────────────────────────────────────
 *
 * Son **nombres propios**: «Activia» es Activia en los cinco idiomas. Es la
 * única entrada de contenido configurable del sistema sin `textoI18n`, y es
 * deliberado — traducirlos obligaría a mantener cinco versiones de algo que no
 * cambia y abriría la puerta a que un idioma acabase con una marca mal escrita.
 *
 * ── Por qué existe el catálogo de referencias ─────────────────────────
 *
 * NO duplica la base de datos de Top Picos del cliente: qué referencias son Top
 * Pico en qué tienda vive en otra aplicación. Aquí solo hace falta que las
 * referencias tengan un nombre estable, para que el GPV elija en lugar de
 * teclear. Con texto libre, «Activia Natural 4×125» y «activia natural 4x125»
 * serían dos referencias distintas y el seguimiento entre visitas se rompería
 * solo (ANEXO, decisión que cierra P25).
 */

type ResultadoImportacion = {
  procesadas: number;
  creadas: number;
  actualizadas: number;
  rechazadas: Array<{ linea: number; motivo: string }>;
};

const CATEGORIAS = ["dairy", "waters", "pbb"];

@Injectable()
export class ProductosService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ── Marcas ───────────────────────────────────────────────────────────

  async listarMarcas(incluirInactivas = false) {
    return this.db
      .select()
      .from(marcas)
      .where(incluirInactivas ? undefined : eq(marcas.activo, true))
      .orderBy(asc(marcas.categoriaProducto), asc(marcas.orden), asc(marcas.nombre));
  }

  async crearMarca(
    dto: { nombre: string; codigo: string; categoriaProducto: string; orden?: number },
    usuario: PayloadToken,
  ) {
    const [creada] = await this.db
      .insert(marcas)
      .values({
        nombre: dto.nombre.trim(),
        codigo: dto.codigo.trim(),
        categoriaProducto: dto.categoriaProducto as "dairy",
        orden: dto.orden ?? 0,
      })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "marca.creada",
      entidad: "marca",
      entidadId: creada!.id,
      cambios: { nombre: { antes: null, despues: creada!.nombre } },
    });

    return creada!;
  }

  /**
   * Editar o dar de baja.
   *
   * Se DESACTIVAN, no se borran: una marca borrada rompería el histórico de
   * facings y visibilidad que la referencia (CONVENTIONS).
   */
  async editarMarca(
    id: string,
    dto: Partial<{ nombre: string; orden: number; activo: boolean }>,
    usuario: PayloadToken,
  ) {
    const [actualizada] = await this.db
      .update(marcas)
      .set({
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      })
      .where(eq(marcas.id, id))
      .returning();

    if (!actualizada) throw new BadRequestException("Marca no encontrada");

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "marca.editada",
      entidad: "marca",
      entidadId: id,
      cambios: { activo: { antes: null, despues: actualizada.activo } },
    });

    return actualizada;
  }

  // ── Referencias ──────────────────────────────────────────────────────

  async listarReferencias(opciones: { categoria?: string; incluirInactivas?: boolean }) {
    const condiciones = [];
    if (!opciones.incluirInactivas) condiciones.push(eq(referenciasProducto.activo, true));
    if (opciones.categoria) {
      condiciones.push(
        eq(referenciasProducto.categoriaProducto, opciones.categoria as "dairy"),
      );
    }

    return this.db
      .select({
        referencia: referenciasProducto,
        marca: { id: marcas.id, nombre: marcas.nombre },
      })
      .from(referenciasProducto)
      .leftJoin(marcas, eq(marcas.id, referenciasProducto.marcaId))
      .where(condiciones.length ? and(...condiciones) : undefined)
      .orderBy(
        asc(referenciasProducto.categoriaProducto),
        asc(referenciasProducto.orden),
        asc(referenciasProducto.nombre),
      );
  }

  async crearReferencia(
    dto: {
      nombre: string;
      codigo: string;
      categoriaProducto: string;
      marcaId?: string;
      orden?: number;
    },
    usuario: PayloadToken,
  ) {
    const [creada] = await this.db
      .insert(referenciasProducto)
      .values({
        nombre: dto.nombre.trim(),
        codigo: dto.codigo.trim(),
        categoriaProducto: dto.categoriaProducto as "dairy",
        marcaId: dto.marcaId ?? null,
        orden: dto.orden ?? 0,
      })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "referencia.creada",
      entidad: "referencia",
      entidadId: creada!.id,
    });

    return creada!;
  }

  async editarReferencia(
    id: string,
    dto: Partial<{ nombre: string; marcaId: string | null; orden: number; activo: boolean }>,
    usuario: PayloadToken,
  ) {
    const [actualizada] = await this.db
      .update(referenciasProducto)
      .set({
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.marcaId !== undefined ? { marcaId: dto.marcaId } : {}),
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      })
      .where(eq(referenciasProducto.id, id))
      .returning();

    if (!actualizada) throw new BadRequestException("Referencia no encontrada");

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "referencia.editada",
      entidad: "referencia",
      entidadId: id,
    });

    return actualizada;
  }

  /**
   * Importación CSV de referencias.
   *
   * Es el camino previsto para poblar el catálogo (ANEXO, P32): son cientos de
   * referencias y darlas de alta a mano no es realista.
   *
   * TOLERANTE A FILAS MALAS, como la de tiendas: una referencia con la
   * categoría mal escrita no debe abortar las otras trescientas. Se devuelve
   * qué se rechazó y por qué, con el número de línea.
   */
  async importarCsv(contenido: string, usuario: PayloadToken): Promise<ResultadoImportacion> {
    const lineas = contenido
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lineas.length < 2) {
      throw new BadRequestException("El CSV necesita una cabecera y al menos una fila");
    }

    const cabecera = lineas[0]!.split(",").map((c) => c.trim().toLowerCase());
    const columna = (nombre: string) => cabecera.indexOf(nombre);

    const iNombre = columna("nombre");
    const iCodigo = columna("codigo");
    const iCategoria = columna("categoria");
    const iMarca = columna("marca");

    if (iNombre < 0 || iCodigo < 0 || iCategoria < 0) {
      throw new BadRequestException(
        "El CSV necesita las columnas: nombre, codigo, categoria (y opcionalmente marca)",
      );
    }

    /** Los códigos de marca se resuelven una vez, no por fila. */
    const marcasPorCodigo = new Map(
      (await this.db.select().from(marcas)).map((m) => [m.codigo, m.id]),
    );

    const resultado: ResultadoImportacion = {
      procesadas: 0,
      creadas: 0,
      actualizadas: 0,
      rechazadas: [],
    };

    for (let i = 1; i < lineas.length; i++) {
      const campos = lineas[i]!.split(",").map((c) => c.trim());
      const linea = i + 1;
      resultado.procesadas++;

      const nombre = campos[iNombre] ?? "";
      const codigo = campos[iCodigo] ?? "";
      const categoria = (campos[iCategoria] ?? "").toLowerCase();
      const codigoMarca = iMarca >= 0 ? campos[iMarca] : undefined;

      if (!nombre) {
        resultado.rechazadas.push({ linea, motivo: "falta el nombre" });
        continue;
      }
      if (!codigo) {
        resultado.rechazadas.push({ linea, motivo: "falta el código" });
        continue;
      }
      if (!CATEGORIAS.includes(categoria)) {
        resultado.rechazadas.push({
          linea,
          motivo: `categoría "${categoria}" desconocida (dairy, waters o pbb)`,
        });
        continue;
      }

      const marcaId = codigoMarca ? marcasPorCodigo.get(codigoMarca) : undefined;
      if (codigoMarca && !marcaId) {
        resultado.rechazadas.push({ linea, motivo: `marca "${codigoMarca}" desconocida` });
        continue;
      }

      /**
       * Alta o actualización por `codigo`.
       *
       * Reimportar el catálogo corregido es el caso normal, no la excepción:
       * si duplicara filas, la segunda importación dejaría el catálogo peor
       * que antes.
       */
      const [existente] = await this.db
        .select({ id: referenciasProducto.id })
        .from(referenciasProducto)
        .where(eq(referenciasProducto.codigo, codigo))
        .limit(1);

      if (existente) {
        await this.db
          .update(referenciasProducto)
          .set({
            nombre,
            categoriaProducto: categoria as "dairy",
            marcaId: marcaId ?? null,
            activo: true,
          })
          .where(eq(referenciasProducto.id, existente.id));
        resultado.actualizadas++;
      } else {
        await this.db.insert(referenciasProducto).values({
          nombre,
          codigo,
          categoriaProducto: categoria as "dairy",
          marcaId: marcaId ?? null,
        });
        resultado.creadas++;
      }
    }

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "referencias.importadas",
      entidad: "referencia",
      cambios: {
        creadas: { antes: null, despues: resultado.creadas },
        actualizadas: { antes: null, despues: resultado.actualizadas },
        rechazadas: { antes: null, despues: resultado.rechazadas.length },
      },
    });

    return resultado;
  }
}
