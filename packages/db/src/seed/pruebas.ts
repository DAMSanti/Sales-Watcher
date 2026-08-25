import { and, eq, sql } from "drizzle-orm";
import { fechaLocal, resolverResponsable, type TipoSituacion } from "@sw/shared";
import { cargarEnv } from "../cargar-env";
import { crearCliente } from "../index";
import {
  categorias,
  fotos,
  incidencias,
  itemsChecklist,
  justificaciones,
  motivosNoRealizacion,
  plantillasChecklist,
  resultadosChecklist,
  rutasDiarias,
  tiendas,
  usuarios,
  visitas,
  zonas,
  acciones,
  comprobacionesAccion,
  deteccionesFechas,
  deteccionesHueco,
  deteccionesStock,
  extraespacios,
  gananciasFacings,
  marcas,
  neveras,
  oportunidadesReorganizacion,
  oportunidadesVisibilidad,
  referenciasProducto,
  relacionesResponsable,
  topPicosPendientes,
} from "../schema/index";

cargarEnv();

/**
 * Genera historial de actividad para desarrollo y pruebas.
 *
 * Distinto del seed normal: aquel carga los catálogos y el maestro mínimo,
 * este fabrica el VOLUMEN — un mes de visitas, incidencias y justificaciones —
 * para que el front del comercial y el futuro cuadro de mando tengan algo real
 * que mostrar en lugar de una pantalla vacía.
 *
 * Las proporciones no son aleatorias uniformes: imitan una operación
 * plausible. Un generador que reparta los estados a partes iguales produce
 * pantallas que no se parecen a nada y esconde justo los casos que importan,
 * como que las no realizadas sin justificar sean minoría pero existan.
 */

if (process.env.NODE_ENV === "production") {
  console.error("Los datos de prueba no deben generarse en producción.");
  process.exit(1);
}

/** Días de historial hacia atrás, sin contar hoy. */
const DIAS_HISTORIAL = 30;

/**
 * Reparto de desenlaces de una visita planificada.
 *
 * Basado en cómo se comporta una operación de campo razonable: la inmensa
 * mayoría se hacen, un puñado no y se justifican, y unas pocas se quedan sin
 * justificar porque al comercial se le pasó la ventana.
 */
const REPARTO = {
  finalizada: 0.84,
  noRealizadaJustificada: 0.1,
  noRealizadaSinJustificar: 0.06,
};

/** Generador determinista: dos ejecuciones producen los mismos datos. */
function crearAzar(semilla: number) {
  let estado = semilla;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

const azar = crearAzar(20260824);

/** Elección ponderada: devuelve la situación según los pesos de arriba. */
function elegirSituacion(): TipoSituacion {
  const total = PESOS_SITUACION.reduce((suma, [, peso]) => suma + peso, 0);
  let punto = azar() * total;
  for (const [tipo, peso] of PESOS_SITUACION) {
    punto -= peso;
    if (punto <= 0) return tipo;
  }
  return "stock";
}

/** Las tres categorías, con Dairy algo más presente por volumen de surtido. */
function elegirCategoria(): "dairy" | "waters" | "pbb" {
  const r = azar();
  return r < 0.45 ? "dairy" : r < 0.75 ? "waters" : "pbb";
}
const elegir = <T>(lista: T[]): T => lista[Math.floor(azar() * lista.length)]!;
const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));

const NOTAS = [
  "El encargado pide más facings de bebibles para la semana que viene.",
  "Reposición prevista para el jueves; el lineal estaba a la mitad.",
  "Cambio de responsable de sección, presentado y con contacto tomado.",
  "Buena rotación en la gama de postres; sin incidencias.",
  "Pendiente de confirmar el espacio para la nevera con el jefe de tienda.",
  "Competencia con promoción agresiva en cabecera esta semana.",
  "",
  "",
];

const DESCRIPCIONES: Record<string, string[]> = {
  inc_rotura_stock: [
    "Sin stock de la referencia principal desde el lunes.",
    "Hueco en lineal de tres facings; almacén también vacío.",
  ],
  inc_precio_incorrecto: [
    "Etiqueta con precio de la promoción anterior.",
    "Precio en góndola no coincide con el del ticket.",
  ],
  inc_caducidad: [
    "Cuatro unidades con fecha de mañana en el frontal.",
    "Producto caducado retirado durante la visita.",
  ],
  inc_cadena_frio: [
    "Mueble frigorífico a 8 grados; avisado el jefe de sección.",
    "Puerta del mural no cierra bien; producto en riesgo.",
  ],
  op_espacio_nevera: [
    "Hueco junto a frescos donde cabría una nevera de 1,2 m.",
    "El encargado ofrece espacio en la entrada para el verano.",
  ],
  op_ampliar_facings: [
    "Posibilidad de ganar dos facings quitando marca blanca.",
    "Espacio libre a la derecha de nuestra sección.",
  ],
};

/**
 * Reparto de situaciones detectadas.
 *
 * No es uniforme a propósito: el stock y los huecos son lo que un GPV ve a
 * diario, y una reorganización de lineal se propone de tarde en tarde. Un
 * reparto plano daría un dashboard con la misma altura en todas las barras,
 * que es justo lo que no se parece a la realidad.
 */
const PESOS_SITUACION: Array<[TipoSituacion, number]> = [
  ["stock", 26],
  ["hueco", 20],
  ["top_pico", 14],
  ["facings", 12],
  ["fechas", 9],
  ["visibilidad", 8],
  ["extraespacio", 6],
  // Las neveras suben de 3 a 7: con el peso anterior salían dos o tres en
  // todo el historial y ninguna con código, así que el panel del FSM nunca
  // llegaba a mostrar el dato más distintivo que tiene.
  ["nevera", 7],
  ["reorganizacion", 2],
];

const PROPUESTAS = [
  "Agrupar todo el vegetal en un solo bloque, hoy está partido.",
  "Subir Activia a altura de ojos y bajar marca blanca al foso.",
  "Reordenar el lineal por formato en vez de por marca.",
  "Juntar bebidas vegetales con lácteos refrigerados.",
];

async function principal() {
  const { db, sql: conexion } = crearCliente();
  console.log("\nGenerando datos de prueba...\n");

  // ── Contexto ───────────────────────────────────────────────────────
  const comerciales = await db
    .select({
      id: usuarios.id,
      numero: usuarios.numeroTrabajador,
      nombre: usuarios.nombre,
      zonaId: usuarios.zonaId,
      zonaHoraria: zonas.zonaHoraria,
    })
    .from(usuarios)
    .leftJoin(zonas, eq(zonas.id, usuarios.zonaId))
    .where(and(eq(usuarios.rol, "comercial"), eq(usuarios.activo, true)));

  if (comerciales.length === 0) {
    throw new Error("No hay comerciales. Ejecuta antes `pnpm db:seed`.");
  }

  const catalogoTiendas = await db
    .select({ id: tiendas.id, zonaId: tiendas.zonaId, tipoId: tiendas.tipoTiendaId })
    .from(tiendas)
    .where(eq(tiendas.activo, true));

  const catalogoCategorias = await db
    .select()
    .from(categorias)
    .where(eq(categorias.activo, true));

  const catalogoMotivos = await db
    .select()
    .from(motivosNoRealizacion)
    .where(eq(motivosNoRealizacion.activo, true));

  /**
   * Supervisores por zona, para saber quién cierra lo que escala al FSM.
   *
   * Sin esto, todo lo cerrado saldría cerrado por el propio GPV y la traza de
   * `cerrada_por_rol` no distinguiría nada — que es justo el dato que el panel
   * necesita para avisar cuando un GPV cierra algo asignado al FSM.
   */
  const supervisores = await db
    .select({ id: usuarios.id, zonaId: usuarios.zonaId })
    .from(usuarios)
    .where(and(eq(usuarios.rol, "supervisor"), eq(usuarios.activo, true)));

  const supervisorDe = (comercial: { id: string; zonaId: string | null }): string =>
    supervisores.find((s) => s.zonaId === comercial.zonaId)?.id ??
    supervisores[0]?.id ??
    // Sin supervisor en la zona, cierra el propio GPV. Devolver null obligaría
    // a tratar el caso en cada punto de uso para algo que no ocurre en la
    // práctica, y `usuario_id` de una comprobación no admite nulos.
    comercial.id;

  const catalogoMarcas = await db
    .select()
    .from(marcas)
    .where(eq(marcas.activo, true));

  const catalogoReferencias = await db
    .select()
    .from(referenciasProducto)
    .where(eq(referenciasProducto.activo, true));

  const plantillas = await db.select().from(plantillasChecklist);
  const items = await db.select().from(itemsChecklist).where(eq(itemsChecklist.activo, true));

  /** Ítems agrupados por plantilla, para no consultar dentro del bucle. */
  const itemsPorPlantilla = new Map<string, typeof items>();
  for (const item of items) {
    const lista = itemsPorPlantilla.get(item.plantillaId) ?? [];
    lista.push(item);
    itemsPorPlantilla.set(item.plantillaId, lista);
  }

  const plantillaDe = (tipoTiendaId: string | null) => {
    const especifica = plantillas.find((p) => p.tipoTiendaId === tipoTiendaId);
    const global = plantillas.find((p) => p.tipoTiendaId === null);
    return especifica ?? global ?? null;
  };

  // ── Limpieza de lo generado previamente ────────────────────────────
  console.log("  Limpiando actividad anterior...");
  /**
   * El orden lo dictan las claves foráneas, de dentro hacia fuera.
   *
   * Las FOTOS van primero: referencian tanto resultados de checklist como
   * incidencias, y borrar cualquiera de las dos antes revienta con una
   * violación de integridad. No es hipotético — el generador falló así en
   * cuanto hubo fotos reales en la base.
   */
  await db.delete(fotos);
  await db.delete(justificaciones);
  await db.delete(incidencias);
  await db.delete(resultadosChecklist);

  /**
   * El ciclo de acciones se borra de dentro hacia fuera, igual que las fotos:
   * `neveras` cuelga de `extraespacios`, los detalles cuelgan de `acciones`, y
   * `comprobaciones_accion` referencia acción y visita a la vez. Invertir
   * cualquiera de estos pasos revienta con violación de integridad.
   */
  await db.delete(neveras);
  await db.delete(extraespacios);
  await db.delete(deteccionesStock);
  await db.delete(deteccionesFechas);
  await db.delete(deteccionesHueco);
  await db.delete(topPicosPendientes);
  await db.delete(gananciasFacings);
  await db.delete(oportunidadesVisibilidad);
  await db.delete(oportunidadesReorganizacion);
  await db.delete(comprobacionesAccion);
  await db.delete(acciones);
  await db.delete(relacionesResponsable);

  await db.delete(visitas);
  await db.delete(rutasDiarias);

  // ── Generación ─────────────────────────────────────────────────────
  let nAcciones = 0;
  let nComprobaciones = 0;
  let nRelaciones = 0;
  let nFacings = 0;
  let nRutas = 0;
  let nVisitas = 0;
  let nResultados = 0;
  let nJustificaciones = 0;
  const porEstado: Record<string, number> = {};

  for (const comercial of comerciales) {
    const tz = comercial.zonaHoraria ?? "Europe/Madrid";
    const suyas = catalogoTiendas.filter((t) => t.zonaId === comercial.zonaId);
    if (suyas.length === 0) continue;

    for (let atras = DIAS_HISTORIAL; atras >= 0; atras--) {
      const momento = new Date(Date.now() - atras * 24 * 60 * 60 * 1000);
      const fecha = fechaLocal(momento, tz);

      /** Sin ruta los domingos: la mayoría de las tiendas están cerradas. */
      if (momento.getDay() === 0) continue;

      /** Barajado determinista para variar la ruta cada día. */
      const ruta = [...suyas]
        .sort(() => azar() - 0.5)
        .slice(0, Math.min(entre(3, 5), suyas.length));

      for (const [orden, tienda] of ruta.entries()) {
        const [filaRuta] = await db
          .insert(rutasDiarias)
          .values({
            usuarioId: comercial.id,
            tiendaId: tienda.id,
            fecha,
            ordenSugerido: orden + 1,
          })
          .onConflictDoNothing()
          .returning();

        if (!filaRuta) continue;
        nRutas++;

        const esHoy = atras === 0;
        const dado = azar();

        /**
         * El día de hoy se deja a medias a propósito: unas visitas cerradas,
         * una en curso y el resto pendientes. Es el estado que se encontrará
         * el comercial al abrir la app, y sin él la vista del día aparecería
         * siempre completa y no se podría probar el flujo real.
         */
        let estado: "pendiente" | "en_curso" | "finalizada" | "no_realizada";
        let justificada = false;

        if (esHoy) {
          estado = orden === 0 ? "finalizada" : orden === 1 ? "en_curso" : "pendiente";
        } else if (dado < REPARTO.finalizada) {
          estado = "finalizada";
        } else if (dado < REPARTO.finalizada + REPARTO.noRealizadaJustificada) {
          estado = "no_realizada";
          justificada = true;
        } else {
          estado = "no_realizada";
          justificada = false;
        }

        porEstado[estado] = (porEstado[estado] ?? 0) + 1;

        const inicio = new Date(`${fecha}T${String(entre(8, 17)).padStart(2, "0")}:${String(entre(0, 59)).padStart(2, "0")}:00Z`);
        const duracion = entre(12, 48);
        const fin = new Date(inicio.getTime() + duracion * 60_000);

        const plantilla = plantillaDe(tienda.tipoId);
        const itemsPlantilla = plantilla
          ? (itemsPorPlantilla.get(plantilla.id) ?? [])
          : [];

        /** Un 18% de las visitas se cierran incompletas, como en la realidad. */
        const incompleta = estado === "finalizada" && azar() < 0.18;

        const [visita] = await db
          .insert(visitas)
          .values({
            usuarioId: comercial.id,
            tiendaId: tienda.id,
            rutaDiariaId: filaRuta.id,
            fecha,
            estado,
            planificada: true,
            justificada,
            incompleta,
            horaInicio: estado === "finalizada" || estado === "en_curso" ? inicio : null,
            horaFin: estado === "finalizada" ? fin : null,
            notasLibres: estado === "finalizada" ? elegir(NOTAS) || null : null,
          })
          .returning();

        if (!visita) continue;
        nVisitas++;

        // ── Resultados de checklist ────────────────────────────────
        if (estado === "finalizada" || estado === "en_curso") {
          /**
           * Si la visita se marcó incompleta, se elige de antemano UN
           * obligatorio que quedará sin completar.
           *
           * Dejarlo al azar por ítem no basta: con suficiente suerte todos
           * salen marcados y queda una visita que dice "incompleta" sin nada
           * que señalar. La pantalla del comercial mostraría el aviso y una
           * lista de pendientes vacía.
           */
          const obligatorios = itemsPlantilla.filter((i) => i.obligatorio);
          const forzadoSinCompletar =
            incompleta && obligatorios.length > 0 ? elegir(obligatorios).id : null;

          const valores = itemsPlantilla.map((item) => {
            if (item.id === forzadoSinCompletar) {
              return {
                visitaId: visita.id,
                itemId: item.id,
                completado: false,
                completadoEn: null,
              };
            }

            const completado =
              estado === "en_curso"
                ? azar() < 0.4
                : incompleta && item.obligatorio
                  ? azar() < 0.6
                  : azar() < 0.95;

            return {
              visitaId: visita.id,
              itemId: item.id,
              completado,
              completadoEn: completado
                ? new Date(inicio.getTime() + entre(1, duracion) * 60_000)
                : null,
            };
          });

          if (valores.length > 0) {
            await db.insert(resultadosChecklist).values(valores).onConflictDoNothing();
            nResultados += valores.length;
          }
        }

        // Las incidencias genéricas ya NO se generan.
        //
        // El reencuadre las sustituyó por los flujos tipificados, y la app de
        // campo dejó de crearlas. Seguir generándolas produciría un dato que
        // nada alimenta: una bandeja que solo puede vaciarse, y unas cifras que
        // parecen actividad sin serlo.
        // ── El ciclo de acciones ───────────────────────────────────
        //
        // Lo que hace útil este bloque para probar el dashboard no es el
        // volumen, sino el GRADIENTE: las acciones antiguas están mayormente
        // resueltas y las recientes abiertas. Sin él, el embudo saldría plano
        // y las métricas de "estancada" no tendrían nada que encontrar.
        if (estado === "finalizada" && azar() < 0.5) {
          const cuantas = azar() < 0.25 ? 2 : 1;

          for (let i = 0; i < cuantas; i++) {
            const tipo = elegirSituacion();
            // Las fechas solo existen en Dairy: es la única con reponedor.
            const categoria = tipo === "fechas" ? "dairy" : elegirCategoria();
            const { responsable } = resolverResponsable(tipo, categoria);

            const detectadaEn = new Date(inicio.getTime() + entre(5, 45) * 60_000);
            const antiguedad = atras / DIAS_HISTORIAL;

            /**
             * Lo viejo se resuelve; lo reciente sigue abierto. Y un residuo de
             * lo viejo se queda abierto a propósito: es lo que alimenta la
             * pregunta "¿qué lleva demasiado tiempo abierto?".
             */
            const estadoAccion =
              antiguedad > 0.55
                ? azar() < 0.75
                  ? "resuelta"
                  : azar() < 0.5
                    ? "abierta"
                    : "descartada"
                : azar() < 0.6
                  ? "abierta"
                  : azar() < 0.75
                    ? "en_curso"
                    : "resuelta";

            const cerrada = estadoAccion === "resuelta" || estadoAccion === "descartada";
            const quienCierra =
              responsable === "fsm" || azar() < 0.3 ? supervisorDe(comercial) : comercial.id;

            const [accion] = await db
              .insert(acciones)
              .values({
                tiendaId: tienda.id,
                visitaOrigenId: visita.id,
                categoriaProducto: categoria,
                tipoSituacion: tipo,
                responsableActuar: responsable,
                estado: estadoAccion as "abierta" | "en_curso" | "resuelta" | "descartada",
                detectadaEn,
                resueltaEn: cerrada
                  ? new Date(detectadaEn.getTime() + entre(1, 12) * 86_400_000)
                  : null,
                cerradaPor: cerrada ? quienCierra : null,
                cerradaPorRol: cerrada
                  ? quienCierra === comercial.id
                    ? "comercial"
                    : "supervisor"
                  : null,
              })
              .returning({ id: acciones.id });

            const accionId = accion!.id;
            nAcciones++;

            // Detalle tipificado, uno por flujo.
            if (tipo === "stock") {
              await db.insert(deteccionesStock).values({
                accionId,
                suficiencia:
                  categoria === "dairy" && azar() < 0.4 ? "reponedor_no_ha_pasado" : "no",
                comunicadoAlResponsable: categoria === "dairy" ? null : azar() < 0.7,
              });
            } else if (tipo === "fechas") {
              await db.insert(deteccionesFechas).values({
                accionId,
                problema: elegir(["fifo_incorrecto", "proximo_caducar", "mal_colocado"] as const),
              });
            } else if (tipo === "hueco") {
              await db.insert(deteccionesHueco).values({
                accionId,
                existeHueco: true,
                cubiertoConAdyacente: categoria === "dairy" ? azar() < 0.35 : null,
                correccion:
                  categoria === "dairy" ? null : azar() < 0.6 ? "si" : "no_posible",
              });
            } else if (tipo === "top_pico") {
              const posibles = catalogoReferencias.filter(
                (r) => r.categoriaProducto === categoria,
              );
              if (posibles.length > 0) {
                const referencia = elegir(posibles);
                await db.insert(topPicosPendientes).values({
                  accionId,
                  referenciaId: referencia.id,
                  incorporada: estadoAccion === "resuelta",
                  incorporadaEn:
                    estadoAccion === "resuelta"
                      ? new Date(detectadaEn.getTime() + entre(1, 12) * 86_400_000)
                      : null,
                });
              }
            } else if (tipo === "facings") {
              const posibles = catalogoMarcas.filter(
                (m) => m.categoriaProducto === categoria,
              );
              const conseguido = azar() < 0.55;
              const ganados = conseguido ? entre(1, 3) : 0;
              await db.insert(gananciasFacings).values({
                accionId,
                marcaId: posibles.length > 0 ? elegir(posibles).id : null,
                conseguido,
                facingsGanados: ganados,
              });
              nFacings += ganados;
            } else if (tipo === "visibilidad") {
              const posibles = catalogoMarcas.filter(
                (m) => m.categoriaProducto === categoria,
              );
              await db.insert(oportunidadesVisibilidad).values({
                accionId,
                marcaId: posibles.length > 0 ? elegir(posibles).id : null,
                ubicacionActual: elegir(["palomar", "foso", "zona_intermedia"] as const),
                propuesta: elegir(["subir_producto", "ganar_espacio", "cambiar_ubicacion"] as const),
              });
            } else if (tipo === "reorganizacion") {
              await db.insert(oportunidadesReorganizacion).values({
                accionId,
                propuesta: elegir(PROPUESTAS),
              });
            } else if (tipo === "extraespacio" || tipo === "nevera") {
              const esNevera = tipo === "nevera";
              const [extra] = await db
                .insert(extraespacios)
                .values({
                  accionId,
                  tipo: esNevera ? "nevera" : elegir(["cabecera", "isla", "pila"] as const),
                  motivo: elegir(["alta_rotacion", "promocion", "potencial_venta"] as const),
                })
                .returning({ id: extraespacios.id });

              if (esNevera) {
                // `necesita_recogida` y `retirada` repetidos: son los casos
                // que llevan código de nevera, y los que el FSM traslada a su
                // propia aplicación.
                const situacion = elegir([
                  "uso_parcial",
                  "vacia_desaprovechada",
                  "necesita_recogida",
                  "necesita_recogida",
                  "retirada",
                  "necesita_nueva",
                ] as const);
                await db.insert(neveras).values({
                  extraespacioId: extra!.id,
                  situacion,
                  // El código solo existe donde hay que mover una unidad concreta.
                  codigoNevera:
                    situacion === "necesita_recogida" || situacion === "retirada"
                      ? `NV-${String(entre(100, 999))}-${categoria.slice(0, 3).toUpperCase()}`
                      : null,
                });
              }
            }

            /**
             * Comprobaciones en visitas posteriores. Se generan sobre lo que ya
             * no está abierto, porque una acción cerrada sin rastro de cómo se
             * cerró deja el historial cojo justo donde el cliente quiere mirar.
             */
            if (estadoAccion !== "abierta") {
              const vueltas = estadoAccion === "resuelta" ? entre(1, 2) : 1;
              for (let v = 0; v < vueltas; v++) {
                const ultima = v === vueltas - 1;
                await db.insert(comprobacionesAccion).values({
                  accionId,
                  visitaId: visita.id,
                  usuarioId: cerrada && ultima ? quienCierra : comercial.id,
                  desenlace: !ultima
                    ? "sigue_pendiente"
                    : estadoAccion === "resuelta"
                      ? "resuelta"
                      : estadoAccion === "descartada"
                        ? "no_procede"
                        : "sigue_pendiente",
                  comprobadaEn: new Date(
                    detectadaEn.getTime() + (v + 1) * entre(3, 9) * 86_400_000,
                  ),
                });
                nComprobaciones++;
              }
            }
          }
        }

        // ── Relación con el responsable de tienda ──────────────────
        // Una por visita, y no siempre: el GPV no habla con el encargado en
        // todas las visitas, y forzarlo daría un histórico irrealmente denso.
        if (estado === "finalizada" && azar() < 0.55) {
          const haHablado = azar() < 0.8;
          await db.insert(relacionesResponsable).values({
            visitaId: visita.id,
            haHablado,
            valoracion: haHablado
              ? elegir(["muy_buena", "buena", "buena", "correcta", "mejorable"] as const)
              : "no_ha_podido_hablar",
            cuestionPendiente: haHablado && azar() < 0.2,
            comentario:
              haHablado && azar() < 0.2 ? "Pendiente de confirmar la cabecera de temporada." : null,
          });
          nRelaciones++;
        }

        // ── Justificaciones ────────────────────────────────────────
        if (estado === "no_realizada" && justificada) {
          const motivo = elegir(catalogoMotivos);
          await db.insert(justificaciones).values({
            visitaId: visita.id,
            motivoId: motivo.id,
            comentario: motivo.requiereComentario
              ? "Obra en la calle, sin acceso al establecimiento."
              : null,
            capturadaEn: new Date(`${fecha}T18:${String(entre(0, 59)).padStart(2, "0")}:00Z`),
            estadoRevision: azar() < 0.6 ? "aceptada" : "pendiente",
          });
          nJustificaciones++;
        }
      }
    }
  }

  console.log(`
  Comerciales .................... ${comerciales.length}
  Rutas asignadas ................ ${nRutas}
  Visitas ........................ ${nVisitas}
    finalizadas .................. ${porEstado.finalizada ?? 0}
    no realizadas ................ ${porEstado.no_realizada ?? 0}
    en curso ..................... ${porEstado.en_curso ?? 0}
    pendientes ................... ${porEstado.pendiente ?? 0}
  Resultados de checklist ........ ${nResultados}
  Justificaciones ................ ${nJustificaciones}
  Acciones ....................... ${nAcciones}
    comprobaciones ............... ${nComprobaciones}
    facings ganados .............. ${nFacings}
  Relación con el responsable .... ${nRelaciones}

  Historial de ${DIAS_HISTORIAL} días. El día de hoy queda a medias a propósito:
  una visita cerrada, una en curso y el resto pendientes.
`);

  await conexion.end();
}

principal().catch((error) => {
  console.error("\nFallo generando datos de prueba:", error);
  process.exit(1);
});
