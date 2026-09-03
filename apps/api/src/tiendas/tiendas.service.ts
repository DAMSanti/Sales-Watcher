import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { tiendas, tiposTienda, usuarios, visitas, zonas } from "@sw/db";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { PayloadToken } from "../auth/auth.service";
import type { TiendaDto } from "./dto/tiendas.dto";

export type ResultadoImportacion = {
  procesadas: number;
  creadas: number;
  actualizadas: number;
  rechazadas: Array<{ fila: number; referencia: string; motivo: string }>;
};

@Injectable()
export class TiendasService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Buscador de tiendas.
   *
   * Lo usan dos pantallas muy distintas: el "Añadir visita" del comercial y la
   * gestión del backoffice. Por eso `soloActivas` es un parámetro — el
   * comercial no debe poder crear una visita a una tienda dada de baja, pero
   * el administrador necesita verlas para reactivarlas.
   */
  async buscar(opciones: {
    texto?: string;
    zonaId?: string;
    tipoTiendaId?: string;
    soloActivas: boolean;
    limite: number;
    desplazamiento: number;
  }) {
    const condiciones = [];

    if (opciones.soloActivas) condiciones.push(eq(tiendas.activo, true));
    if (opciones.zonaId) condiciones.push(eq(tiendas.zonaId, opciones.zonaId));
    if (opciones.tipoTiendaId) {
      condiciones.push(eq(tiendas.tipoTiendaId, opciones.tipoTiendaId));
    }

    if (opciones.texto) {
      const patron = `%${opciones.texto}%`;
      /**
       * Se busca por nombre Y por número de referencia, como pide SPECS §5.3:
       * el comercial a veces recuerda el nombre de la tienda y a veces solo
       * lleva apuntada la referencia.
       */
      condiciones.push(
        or(
          ilike(tiendas.nombre, patron),
          ilike(tiendas.numeroReferencia, patron),
          ilike(tiendas.localidad, patron),
        )!,
      );
    }

    const filtro = condiciones.length ? and(...condiciones) : undefined;

    const [filas, conteo] = await Promise.all([
      this.db
        .select({
          tienda: tiendas,
          zona: { id: zonas.id, codigo: zonas.codigo },
          tipo: { id: tiposTienda.id, codigo: tiposTienda.codigo },
        })
        .from(tiendas)
        .leftJoin(zonas, eq(zonas.id, tiendas.zonaId))
        .leftJoin(tiposTienda, eq(tiposTienda.id, tiendas.tipoTiendaId))
        .where(filtro)
        .orderBy(asc(tiendas.nombre))
        .limit(opciones.limite)
        .offset(opciones.desplazamiento),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(tiendas)
        .where(filtro),
    ]);

    return { total: conteo[0]?.total ?? 0, tiendas: filas };
  }

  /**
   * Ficha de tienda para el FSM (SPECS §6.4).
   *
   * Deliberadamente mínima: nombre, código y GPV responsable. Sin ubicación ni
   * características generales — eso es la gestión maestra (6.1), una pantalla
   * distinta con una audiencia distinta.
   *
   * **GPV responsable** no es una asignación en el modelo (no existe esa
   * tabla, ver ANEXO/ROADMAP): se deriva de quién hizo la visita más reciente a
   * esta tienda. Con una sola zona operativa hoy es una aproximación
   * razonable; si la operación crece a varias zonas con varios GPV, esto
   * debería sustituirse por una asignación real.
   */
  async ficha(id: string, usuario: PayloadToken) {
    const [tienda] = await this.db
      .select({
        id: tiendas.id,
        nombre: tiendas.nombre,
        numeroReferencia: tiendas.numeroReferencia,
        zonaId: tiendas.zonaId,
      })
      .from(tiendas)
      .where(eq(tiendas.id, id))
      .limit(1);

    if (!tienda) throw new NotFoundException("Tienda no encontrada");
    if (usuario.rol === "supervisor" && tienda.zonaId !== usuario.zonaId) {
      throw new ForbiddenException("Esta tienda no es de tu zona");
    }

    const [ultimaVisita] = await this.db
      .select({
        gpvId: usuarios.id,
        gpv: usuarios.nombre,
        numeroTrabajador: usuarios.numeroTrabajador,
      })
      .from(visitas)
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(eq(visitas.tiendaId, id))
      .orderBy(desc(visitas.fecha))
      .limit(1);

    return {
      id: tienda.id,
      nombre: tienda.nombre,
      numeroReferencia: tienda.numeroReferencia,
      gpvResponsable: ultimaVisita ?? null,
    };
  }

  async crear(dto: TiendaDto, usuario: PayloadToken) {
    await this.exigirReferenciaLibre(dto.numeroReferencia);

    const [creada] = await this.db
      .insert(tiendas)
      .values({ ...dto, origen: "manual" })
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "tienda.creada",
      entidad: "tienda",
      entidadId: creada!.id,
      cambios: { referencia: { antes: null, despues: dto.numeroReferencia } },
    });

    return creada;
  }

  async editar(id: string, dto: Partial<TiendaDto>, usuario: PayloadToken) {
    const [anterior] = await this.db
      .select()
      .from(tiendas)
      .where(eq(tiendas.id, id))
      .limit(1);

    if (!anterior) throw new NotFoundException("Tienda no encontrada");

    if (dto.numeroReferencia && dto.numeroReferencia !== anterior.numeroReferencia) {
      await this.exigirReferenciaLibre(dto.numeroReferencia, id);
    }

    const [actualizada] = await this.db
      .update(tiendas)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(tiendas.id, id))
      .returning();

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "tienda.editada",
      entidad: "tienda",
      entidadId: id,
      cambios: this.calcularCambios(anterior, actualizada!),
    });

    return actualizada;
  }

  /**
   * Importación desde CSV.
   *
   * Es el paso intermedio antes de la integración con ERP, y también su
   * ensayo: el mapeo de columnas que se defina aquí es el borrador del
   * contrato que necesitará esa integración (ANEXO, decisión que cierra P2).
   *
   * NO aborta el fichero entero ante una fila mala. Un CSV de tres mil tiendas
   * con dos filas defectuosas debe cargar dos mil novecientas noventa y ocho y
   * decir exactamente cuáles fallaron y por qué; rechazarlo entero obligaría a
   * un ciclo de corrección a ciegas.
   */
  async importarCsv(contenido: string, usuario: PayloadToken) {
    const filas = this.parsearCsv(contenido);
    const resultado: ResultadoImportacion = {
      procesadas: 0,
      creadas: 0,
      actualizadas: 0,
      rechazadas: [],
    };

    /** Se resuelven los códigos a identificadores una vez, no por fila. */
    const zonasPorCodigo = new Map(
      (await this.db.select().from(zonas)).map((z) => [z.codigo, z.id]),
    );
    const tiposPorCodigo = new Map(
      (await this.db.select().from(tiposTienda)).map((t) => [t.codigo, t.id]),
    );

    for (const [indice, fila] of filas.entries()) {
      // +2: la cabecera ocupa la línea 1, y el usuario cuenta desde 1.
      const numeroFila = indice + 2;
      resultado.procesadas++;

      const referencia = fila.numero_referencia?.trim();
      if (!referencia) {
        resultado.rechazadas.push({
          fila: numeroFila,
          referencia: "",
          motivo: "Falta numero_referencia",
        });
        continue;
      }

      if (!fila.nombre?.trim()) {
        resultado.rechazadas.push({
          fila: numeroFila,
          referencia,
          motivo: "Falta nombre",
        });
        continue;
      }

      const zonaId = fila.zona ? zonasPorCodigo.get(fila.zona.trim()) : undefined;
      if (fila.zona && !zonaId) {
        resultado.rechazadas.push({
          fila: numeroFila,
          referencia,
          motivo: `Zona desconocida: "${fila.zona}"`,
        });
        continue;
      }

      const tipoId = fila.tipo_tienda
        ? tiposPorCodigo.get(fila.tipo_tienda.trim())
        : undefined;
      if (fila.tipo_tienda && !tipoId) {
        resultado.rechazadas.push({
          fila: numeroFila,
          referencia,
          motivo: `Tipo de tienda desconocido: "${fila.tipo_tienda}"`,
        });
        continue;
      }

      const ubicacion = this.parsearUbicacion(fila);
      if (ubicacion === "invalida") {
        resultado.rechazadas.push({
          fila: numeroFila,
          referencia,
          motivo: "Latitud o longitud no numéricas o fuera de rango",
        });
        continue;
      }

      const valores = {
        nombre: fila.nombre.trim(),
        numeroReferencia: referencia,
        direccion: fila.direccion?.trim() || null,
        localidad: fila.localidad?.trim() || null,
        codigoPostal: fila.codigo_postal?.trim() || null,
        zonaId: zonaId ?? null,
        tipoTiendaId: tipoId ?? null,
        ...(ubicacion ? { ubicacion } : {}),
        /** Marca el origen: cuando llegue el ERP habrá que distinguirlas. */
        origen: "csv" as const,
      };

      try {
        const [existente] = await this.db
          .select({ id: tiendas.id })
          .from(tiendas)
          .where(eq(tiendas.numeroReferencia, referencia))
          .limit(1);

        if (existente) {
          await this.db
            .update(tiendas)
            .set({ ...valores, actualizadoEn: new Date() })
            .where(eq(tiendas.id, existente.id));
          resultado.actualizadas++;
        } else {
          await this.db.insert(tiendas).values(valores);
          resultado.creadas++;
        }
      } catch (error) {
        resultado.rechazadas.push({
          fila: numeroFila,
          referencia,
          motivo: error instanceof Error ? error.message : "Error al guardar",
        });
      }
    }

    await this.auditoria.registrar({
      usuarioId: usuario.sub,
      numeroTrabajador: usuario.numeroTrabajador,
      accion: "tienda.importacion_csv",
      entidad: "tienda",
      cambios: {
        creadas: { antes: null, despues: resultado.creadas },
        actualizadas: { antes: null, despues: resultado.actualizadas },
        rechazadas: { antes: null, despues: resultado.rechazadas.length },
      },
    });

    return resultado;
  }

  /**
   * Parseo de CSV con soporte para comillas.
   *
   * Se implementa a mano en lugar de traer una dependencia porque el formato
   * está bajo nuestro control y las direcciones postales españolas traen comas
   * con frecuencia ("Calle Mayor 12, 3º B"), que es exactamente lo que un
   * `split(",")` ingenuo rompería.
   */
  private parsearCsv(contenido: string): Array<Record<string, string>> {
    const lineas = contenido
      .replace(/^﻿/, "") // Excel exporta con BOM.
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "");

    if (lineas.length < 2) return [];

    const cabeceras = this.dividirLinea(lineas[0]!).map((h) =>
      h.trim().toLowerCase(),
    );

    return lineas.slice(1).map((linea) => {
      const celdas = this.dividirLinea(linea);
      return Object.fromEntries(
        cabeceras.map((h, i) => [h, celdas[i] ?? ""]),
      ) as Record<string, string>;
    });
  }

  private dividirLinea(linea: string): string[] {
    const celdas: string[] = [];
    let actual = "";
    let entreComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        // Comilla doble dentro de comillas: es un literal.
        if (entreComillas && linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = !entreComillas;
        }
      } else if (c === "," && !entreComillas) {
        celdas.push(actual);
        actual = "";
      } else {
        actual += c;
      }
    }
    celdas.push(actual);
    return celdas;
  }

  private parsearUbicacion(fila: Record<string, string>) {
    const lat = fila.lat?.trim();
    const lon = fila.lon?.trim();
    if (!lat && !lon) return null;

    const latitud = Number(lat);
    const longitud = Number(lon);

    if (
      !Number.isFinite(latitud) ||
      !Number.isFinite(longitud) ||
      Math.abs(latitud) > 90 ||
      Math.abs(longitud) > 180
    ) {
      return "invalida" as const;
    }

    return {
      lat: latitud,
      lon: longitud,
      /**
       * Cero: es la ubicación oficial de la ficha, no una lectura de GPS. La
       * incertidumbre solo tiene sentido en lo que captura un dispositivo.
       */
      precisionM: 0,
      capturadoEn: new Date().toISOString(),
    };
  }

  private async exigirReferenciaLibre(referencia: string, excluyendoId?: string) {
    const [existente] = await this.db
      .select({ id: tiendas.id })
      .from(tiendas)
      .where(and(eq(tiendas.numeroReferencia, referencia), eq(tiendas.activo, true)))
      .limit(1);

    if (existente && existente.id !== excluyendoId) {
      throw new ConflictException(
        `Ya hay una tienda activa con la referencia "${referencia}"`,
      );
    }
  }

  /** Delta de campos cambiados, para la auditoría. Solo lo que cambió. */
  private calcularCambios(
    antes: typeof tiendas.$inferSelect,
    despues: typeof tiendas.$inferSelect,
  ) {
    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const clave of Object.keys(antes) as Array<keyof typeof antes>) {
      if (clave === "actualizadoEn") continue;
      if (JSON.stringify(antes[clave]) !== JSON.stringify(despues[clave])) {
        cambios[clave] = { antes: antes[clave], despues: despues[clave] };
      }
    }
    return cambios;
  }
}
