import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import {
  acciones,
  comprobacionesAccion,
  deteccionesStock,
  gananciasFacings,
  marcas,
  tiendas,
  topPicosPendientes,
  usuarios,
  visitas,
} from "@sw/db";
import { UMBRAL_ESTANCADA_DIAS } from "@sw/shared";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { Configuracion } from "../config/configuracion";
import type { PayloadToken } from "../auth/auth.service";
import type { Filtros } from "./informes.service";

/**
 * Dashboard de resultados (SPECS §6.4).
 *
 * Vive aparte de `InformesService` a propósito. Los informes existentes miden
 * **actividad** —cuántas visitas, cuánta cobertura— y este mide **resultado**.
 * El cliente es explícito en que el objetivo no es saber cuántas visitas ha
 * hecho cada GPV, y mezclar ambas cosas en un servicio invitaría a mezclarlas
 * también en la pantalla.
 *
 * ── Dos bases temporales distintas, y conviene saberlo ────────────────
 *
 * El embudo y los facings usan **la fecha de la visita en que se detectó**: son
 * una cohorte, «de lo que detectamos en este periodo, cuánto convertimos».
 *
 * Los Top Picos incorporados usan **la fecha en que se incorporaron**, porque
 * es un logro con fecha propia: un Top Pico detectado en marzo e incorporado en
 * abril es un resultado de abril.
 *
 * Son lecturas legítimas y distintas. Si se asume que comparten base, los
 * números no cuadran — de ahí que cada respuesta declare la suya.
 */

/** Situaciones que el boceto agrupa como oportunidades (SPECS §5.5, ANEXO §7). */
const OPORTUNIDADES = ["top_pico", "facings", "visibilidad", "reorganizacion"] as const;
const INCIDENCIAS = ["stock", "fechas", "hueco"] as const;

@Injectable()
export class ResultadosService {
  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly config: ConfigService<Configuracion, true>,
  ) {}

  private get umbralEstancada(): number {
    return this.config.get("ACCION_ESTANCADA_DIAS", { infer: true }) ?? UMBRAL_ESTANCADA_DIAS;
  }

  /**
   * Ámbito del solicitante.
   *
   * Igual que en los informes de actividad: el supervisor solo ve su zona. Se
   * filtra por la zona del GPV y no la de la tienda, porque supervisa a un
   * equipo, no un territorio de escaparates.
   */
  private ambito(usuario: PayloadToken, filtros: Filtros): SQL[] {
    const condiciones: SQL[] = [
      gte(visitas.fecha, filtros.desde),
      lte(visitas.fecha, filtros.hasta),
    ];

    if (usuario.rol === "supervisor" && usuario.zonaId) {
      condiciones.push(eq(usuarios.zonaId, usuario.zonaId));
    } else if (filtros.zonaId) {
      condiciones.push(eq(usuarios.zonaId, filtros.zonaId));
    }

    if (filtros.usuarioId) condiciones.push(eq(visitas.usuarioId, filtros.usuarioId));
    if (filtros.tiendaId) condiciones.push(eq(acciones.tiendaId, filtros.tiendaId));

    if (filtros.canal) {
      condiciones.push(
        sql`${acciones.tiendaId} in (
          select ${tiendas.id} from ${tiendas} where ${tiendas.canal} = ${filtros.canal}
        )`,
      );
    }

    return condiciones;
  }

  /**
   * Preguntas 1 a 3: el embudo detectado → trabajado → solucionado.
   *
   * **Es una cohorte, no tres contadores independientes.** Se toman las
   * oportunidades detectadas en el periodo y se mira qué fue de ellas. Contar
   * "solucionadas en el periodo" por separado permitiría que solucionadas
   * superase a detectadas —cerrando cosas viejas— y el embudo dejaría de
   * leerse como embudo.
   *
   * "Trabajada" es una acción sobre la que alguien se ha pronunciado: tiene al
   * menos una comprobación, o alguien la movió de estado desde el panel.
   */
  async embudo(usuario: PayloadToken, filtros: Filtros) {
    const [fila] = await this.db
      .select({
        detectadas: sql<number>`count(*)::int`,
        trabajadas: sql<number>`count(*) filter (
          where ${acciones.estado} <> 'abierta'
             or exists (
               select 1 from ${comprobacionesAccion}
               where ${comprobacionesAccion.accionId} = ${acciones.id}
             )
        )::int`,
        solucionadas: sql<number>`count(*) filter (where ${acciones.estado} = 'resuelta')::int`,
        descartadas: sql<number>`count(*) filter (where ${acciones.estado} = 'descartada')::int`,
        sinTocar: sql<number>`count(*) filter (
          where ${acciones.estado} = 'abierta'
            and not exists (
              select 1 from ${comprobacionesAccion}
              where ${comprobacionesAccion.accionId} = ${acciones.id}
            )
        )::int`,
      })
      .from(acciones)
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(
        and(
          ...this.ambito(usuario, filtros),
          inArray(acciones.tipoSituacion, [...OPORTUNIDADES]),
        ),
      );

    const detectadas = fila?.detectadas ?? 0;
    return {
      base: "cohorte por fecha de detección",
      detectadas,
      trabajadas: fila?.trabajadas ?? 0,
      solucionadas: fila?.solucionadas ?? 0,
      descartadas: fila?.descartadas ?? 0,
      sinTocar: fila?.sinTocar ?? 0,
      /** Porcentaje de lo detectado que acabó en resultado. */
      tasaConversion:
        detectadas === 0 ? null : Math.round(((fila?.solucionadas ?? 0) / detectadas) * 100),
    };
  }

  /**
   * Pregunta 4: facings ganados, con el desglose que pide el cliente.
   *
   * Es la cifra más tangible del sistema y la única que se **suma** para
   * producir un resultado de negocio: «+30 facings este mes». El cliente pide
   * poder acumularla por GPV, tienda, categoría, marca y mes.
   */
  async facings(usuario: PayloadToken, filtros: Filtros, dimension: string) {
    const condiciones = and(
      ...this.ambito(usuario, filtros),
      eq(acciones.tipoSituacion, "facings"),
      eq(gananciasFacings.conseguido, true),
    );

    // Cada dimensión es una columna distinta de agrupación. Se declaran así,
    // explícitamente, para no construir SQL a partir de texto del usuario.
    const dimensiones = {
      gpv: { etiqueta: usuarios.nombre, clave: usuarios.id },
      tienda: { etiqueta: tiendas.nombre, clave: tiendas.id },
      categoria: { etiqueta: acciones.categoriaProducto, clave: acciones.categoriaProducto },
      marca: { etiqueta: marcas.nombre, clave: marcas.id },
      mes: {
        etiqueta: sql<string>`to_char(${visitas.fecha}, 'YYYY-MM')`,
        clave: sql`to_char(${visitas.fecha}, 'YYYY-MM')`,
      },
    } as const;

    const elegida = dimensiones[dimension as keyof typeof dimensiones] ?? dimensiones.gpv;

    const filas = await this.db
      .select({
        etiqueta: elegida.etiqueta,
        facings: sql<number>`coalesce(sum(${gananciasFacings.facingsGanados}), 0)::int`,
        operaciones: sql<number>`count(*)::int`,
      })
      .from(acciones)
      .innerJoin(gananciasFacings, eq(gananciasFacings.accionId, acciones.id))
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .leftJoin(marcas, eq(marcas.id, gananciasFacings.marcaId))
      .where(condiciones)
      .groupBy(elegida.clave, elegida.etiqueta)
      .orderBy(sql`2 desc`);

    const total = filas.reduce((suma, f) => suma + f.facings, 0);
    return { dimension: dimension in dimensiones ? dimension : "gpv", total, filas };
  }

  /**
   * Pregunta 5: Top Picos incorporados.
   *
   * Base distinta al resto: se cuentan por **fecha de incorporación**, porque
   * es un logro con fecha propia. Uno detectado en marzo e incorporado en abril
   * cuenta en abril, que es cuando se consiguió.
   */
  async topPicosIncorporados(usuario: PayloadToken, filtros: Filtros) {
    const condiciones: SQL[] = [
      eq(topPicosPendientes.incorporada, true),
      sql`${topPicosPendientes.incorporadaEn}::date >= ${filtros.desde}`,
      sql`${topPicosPendientes.incorporadaEn}::date <= ${filtros.hasta}`,
    ];

    if (usuario.rol === "supervisor" && usuario.zonaId) {
      condiciones.push(eq(tiendas.zonaId, usuario.zonaId));
    }
    if (filtros.tiendaId) condiciones.push(eq(acciones.tiendaId, filtros.tiendaId));

    const [total] = await this.db
      .select({ incorporados: sql<number>`count(*)::int` })
      .from(topPicosPendientes)
      .innerJoin(acciones, eq(acciones.id, topPicosPendientes.accionId))
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(and(...condiciones));

    // Y lo que sigue sin conseguirse, que es la otra mitad de la historia.
    const pendientes: SQL[] = [eq(topPicosPendientes.incorporada, false)];
    if (usuario.rol === "supervisor" && usuario.zonaId) {
      pendientes.push(eq(tiendas.zonaId, usuario.zonaId));
    }

    const [abiertos] = await this.db
      .select({ pendientes: sql<number>`count(*)::int` })
      .from(topPicosPendientes)
      .innerJoin(acciones, eq(acciones.id, topPicosPendientes.accionId))
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(and(inArray(acciones.estado, ["abierta", "en_curso"]), ...pendientes));

    return {
      base: "fecha de incorporación",
      incorporados: total?.incorporados ?? 0,
      pendientes: abiertos?.pendientes ?? 0,
    };
  }

  /**
   * Preguntas 6 y 7: patrones de repetición.
   *
   * Solo funcionan porque lo detectado está **tipificado**. Con descripciones
   * en texto libre no habría forma de saber que dos visitas reportaron el mismo
   * problema en la misma tienda.
   */
  async patrones(usuario: PayloadToken, filtros: Filtros, minimoRepeticiones: number) {
    // Q6: faltas de stock que se repiten en la misma tienda y categoría.
    const stockRepetido = await this.db
      .select({
        tiendaId: tiendas.id,
        tienda: tiendas.nombre,
        numeroReferencia: tiendas.numeroReferencia,
        categoriaProducto: acciones.categoriaProducto,
        veces: sql<number>`count(*)::int`,
        ultima: sql<string>`max(${visitas.fecha})`,
      })
      .from(acciones)
      .innerJoin(deteccionesStock, eq(deteccionesStock.accionId, acciones.id))
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(
        and(
          ...this.ambito(usuario, filtros),
          // Solo cuenta la falta real: "sí hay suficiente" no es un problema.
          sql`${deteccionesStock.suficiencia} <> 'si'`,
        ),
      )
      .groupBy(tiendas.id, tiendas.nombre, tiendas.numeroReferencia, acciones.categoriaProducto)
      .having(sql`count(*) >= ${minimoRepeticiones}`)
      .orderBy(sql`5 desc`);

    // Q7: tiendas con más incidencias, sean del tipo que sean.
    const tiendasRecurrentes = await this.db
      .select({
        tiendaId: tiendas.id,
        tienda: tiendas.nombre,
        numeroReferencia: tiendas.numeroReferencia,
        localidad: tiendas.localidad,
        incidencias: sql<number>`count(*)::int`,
        sinResolver: sql<number>`count(*) filter (
          where ${acciones.estado} in ('abierta', 'en_curso')
        )::int`,
        tipos: sql<string[]>`array_agg(distinct ${acciones.tipoSituacion}::text)`,
      })
      .from(acciones)
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(
        and(
          ...this.ambito(usuario, filtros),
          inArray(acciones.tipoSituacion, [...INCIDENCIAS]),
        ),
      )
      .groupBy(tiendas.id, tiendas.nombre, tiendas.numeroReferencia, tiendas.localidad)
      .having(sql`count(*) >= ${minimoRepeticiones}`)
      .orderBy(sql`5 desc`)
      .limit(20);

    return { minimoRepeticiones, stockRepetido, tiendasRecurrentes };
  }

  /**
   * Pregunta 8: lo que lleva demasiado tiempo abierto.
   *
   * No filtra por periodo: una acción de hace tres meses sigue abierta hoy, y
   * acotarla al periodo la escondería justo cuando más importa.
   */
  async seguimiento(usuario: PayloadToken, filtros: Filtros) {
    const condiciones: SQL[] = [inArray(acciones.estado, ["abierta", "en_curso"])];

    if (usuario.rol === "supervisor" && usuario.zonaId) {
      condiciones.push(eq(tiendas.zonaId, usuario.zonaId));
    } else if (filtros.zonaId) {
      condiciones.push(eq(tiendas.zonaId, filtros.zonaId));
    }
    if (filtros.tiendaId) condiciones.push(eq(acciones.tiendaId, filtros.tiendaId));

    const umbral = this.umbralEstancada;
    const estancada = sql`${acciones.detectadaEn} < now() - (${umbral} || ' days')::interval`;

    const [resumen] = await this.db
      .select({
        abiertas: sql<number>`count(*)::int`,
        estancadas: sql<number>`count(*) filter (where ${estancada})::int`,
        diasMedios: sql<number>`round(avg(extract(epoch from now() - ${acciones.detectadaEn}) / 86400))::int`,
        masAntigua: sql<number>`max(extract(day from now() - ${acciones.detectadaEn}))::int`,
      })
      .from(acciones)
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(and(...condiciones));

    const masViejas = await this.db
      .select({
        id: acciones.id,
        tipoSituacion: acciones.tipoSituacion,
        categoriaProducto: acciones.categoriaProducto,
        responsableActuar: acciones.responsableActuar,
        detectadaEn: acciones.detectadaEn,
        dias: sql<number>`extract(day from now() - ${acciones.detectadaEn})::int`,
        tienda: tiendas.nombre,
        numeroReferencia: tiendas.numeroReferencia,
      })
      .from(acciones)
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(and(...condiciones, estancada))
      .orderBy(acciones.detectadaEn)
      .limit(10);

    return {
      umbralDias: umbral,
      abiertas: resumen?.abiertas ?? 0,
      estancadas: resumen?.estancadas ?? 0,
      diasMedios: resumen?.diasMedios ?? 0,
      masAntiguaDias: resumen?.masAntigua ?? 0,
      masViejas,
    };
  }

  /**
   * Preguntas 9 y 10: qué GPVs detectan más y cuáles consiguen más resultado.
   *
   * **Se devuelven en la misma fila a propósito.** Son dos preguntas distintas
   * y presentarlas por separado crea un incentivo torcido: premiar solo el
   * resultado desincentiva registrar lo que uno no puede resolver —que es justo
   * lo que debe escalar al FSM— y premiar solo la detección invita a inflar el
   * registro.
   */
  async equipo(usuario: PayloadToken, filtros: Filtros) {
    const filas = await this.db
      .select({
        usuarioId: usuarios.id,
        nombre: usuarios.nombre,
        numeroTrabajador: usuarios.numeroTrabajador,
        detectadas: sql<number>`count(*)::int`,
        oportunidades: sql<number>`count(*) filter (
          where ${acciones.tipoSituacion} in ('top_pico','facings','visibilidad','reorganizacion')
        )::int`,
        incidencias: sql<number>`count(*) filter (
          where ${acciones.tipoSituacion} in ('stock','fechas','hueco')
        )::int`,
        resueltas: sql<number>`count(*) filter (where ${acciones.estado} = 'resuelta')::int`,
        /**
         * Resueltas DE LAS SUYAS.
         *
         * Sin restringir el numerador al responsable, una acción de Dairy que
         * cerró el FSM contaba como resolución del GPV y la tasa se iba por
         * encima del 100 % — que es como se detectó, mirando la tabla pintada.
         */
        resueltasPropias: sql<number>`count(*) filter (
          where ${acciones.estado} = 'resuelta' and ${acciones.responsableActuar} = 'gpv'
        )::int`,
        /** Lo que el propio GPV podía resolver, frente a lo que escaló. */
        propias: sql<number>`count(*) filter (where ${acciones.responsableActuar} = 'gpv')::int`,
        escaladas: sql<number>`count(*) filter (where ${acciones.responsableActuar} = 'fsm')::int`,
        facings: sql<number>`coalesce(sum(
          case when ${gananciasFacings.conseguido} then ${gananciasFacings.facingsGanados} else 0 end
        ), 0)::int`,
      })
      .from(acciones)
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .leftJoin(gananciasFacings, eq(gananciasFacings.accionId, acciones.id))
      .where(and(...this.ambito(usuario, filtros)))
      .groupBy(usuarios.id, usuarios.nombre, usuarios.numeroTrabajador)
      .orderBy(sql`4 desc`);

    return filas.map((f) => ({
      ...f,
      /**
       * De lo que el GPV **sí podía resolver**, cuánto resolvió. Numerador y
       * denominador acotados los dos al mismo conjunto: medir sobre el total le
       * penalizaría por lo que escaló al FSM —que es exactamente lo que debe
       * hacer cuando no puede actuar— y mezclar ambos da tasas imposibles.
       */
      tasaResolucionPropia:
        f.propias === 0 ? null : Math.round((f.resueltasPropias / f.propias) * 100),
    }));
  }

  /**
   * Pregunta 11: dónde estamos perdiendo oportunidades de venta.
   *
   * Es la más abierta del cliente, así que conviene declarar la lectura: se
   * cuentan las **oportunidades detectadas que no acabaron en resultado** —
   * siguen abiertas o se descartaron—, agrupadas por tienda y categoría. Es
   * decir, potencial identificado sobre el que no se materializó nada.
   *
   * Se añade aparte la ganancia de facings **detectada pero no conseguida**,
   * que es la forma más concreta de "espacio que no llegamos a ganar".
   */
  async perdidas(usuario: PayloadToken, filtros: Filtros) {
    const porTiendaYCategoria = await this.db
      .select({
        tiendaId: tiendas.id,
        tienda: tiendas.nombre,
        numeroReferencia: tiendas.numeroReferencia,
        canal: tiendas.canal,
        categoriaProducto: acciones.categoriaProducto,
        detectadas: sql<number>`count(*)::int`,
        sinResultado: sql<number>`count(*) filter (
          where ${acciones.estado} in ('abierta','en_curso','descartada')
        )::int`,
      })
      .from(acciones)
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .innerJoin(tiendas, eq(tiendas.id, acciones.tiendaId))
      .where(
        and(
          ...this.ambito(usuario, filtros),
          inArray(acciones.tipoSituacion, [...OPORTUNIDADES]),
        ),
      )
      .groupBy(
        tiendas.id,
        tiendas.nombre,
        tiendas.numeroReferencia,
        tiendas.canal,
        acciones.categoriaProducto,
      )
      .having(sql`count(*) filter (where ${acciones.estado} in ('abierta','en_curso','descartada')) > 0`)
      .orderBy(sql`7 desc`)
      .limit(20);

    const [facingsPerdidos] = await this.db
      .select({
        oportunidades: sql<number>`count(*)::int`,
        noConseguidas: sql<number>`count(*) filter (where ${gananciasFacings.conseguido} = false)::int`,
      })
      .from(acciones)
      .innerJoin(gananciasFacings, eq(gananciasFacings.accionId, acciones.id))
      .innerJoin(visitas, eq(visitas.id, acciones.visitaOrigenId))
      .innerJoin(usuarios, eq(usuarios.id, visitas.usuarioId))
      .where(and(...this.ambito(usuario, filtros)));

    return {
      lectura: "oportunidades detectadas que no acabaron en resultado",
      porTiendaYCategoria,
      facings: {
        detectadas: facingsPerdidos?.oportunidades ?? 0,
        noConseguidas: facingsPerdidos?.noConseguidas ?? 0,
      },
    };
  }

  /** El panel completo: las once preguntas en una sola llamada. */
  async panel(usuario: PayloadToken, filtros: Filtros, minimoRepeticiones: number) {
    const [embudo, facings, topPicos, patrones, seguimiento, equipo, perdidas] =
      await Promise.all([
        this.embudo(usuario, filtros),
        this.facings(usuario, filtros, "gpv"),
        this.topPicosIncorporados(usuario, filtros),
        this.patrones(usuario, filtros, minimoRepeticiones),
        this.seguimiento(usuario, filtros),
        this.equipo(usuario, filtros),
        this.perdidas(usuario, filtros),
      ]);

    return {
      periodo: { desde: filtros.desde, hasta: filtros.hasta },
      embudo,
      logros: { facings: facings.total, topPicos },
      patrones,
      seguimiento,
      equipo,
      perdidas,
    };
  }
}
