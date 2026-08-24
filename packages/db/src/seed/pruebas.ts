import { and, eq, sql } from "drizzle-orm";
import { fechaLocal } from "@sw/shared";
import { cargarEnv } from "../cargar-env";
import { crearCliente } from "../index";
import {
  categorias,
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
  await db.delete(justificaciones);
  await db.delete(incidencias);
  await db.delete(resultadosChecklist);
  await db.delete(visitas);
  await db.delete(rutasDiarias);

  // ── Generación ─────────────────────────────────────────────────────
  let nRutas = 0;
  let nVisitas = 0;
  let nResultados = 0;
  let nIncidencias = 0;
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

        // ── Incidencias y oportunidades ────────────────────────────
        if (estado === "finalizada" && azar() < 0.38) {
          const cuantas = azar() < 0.15 ? 2 : 1;
          for (let i = 0; i < cuantas; i++) {
            const categoria = elegir(catalogoCategorias);
            const textos = DESCRIPCIONES[categoria.codigo];

            /**
             * Las antiguas están mayormente resueltas y las recientes abiertas.
             * Sin ese gradiente, la bandeja del supervisor saldría llena de
             * incidencias de hace un mes sin tocar, que no es lo que enseña
             * una operación sana.
             */
            const antiguedad = atras / DIAS_HISTORIAL;
            const estadoInc =
              antiguedad > 0.5
                ? azar() < 0.85
                  ? "resuelta"
                  : "abierta"
                : azar() < 0.45
                  ? "abierta"
                  : azar() < 0.7
                    ? "en_revision"
                    : "resuelta";

            await db.insert(incidencias).values({
              visitaId: visita.id,
              categoriaId: categoria.id,
              descripcion: textos ? elegir(textos) : null,
              prioridad: categoria.prioridadDefecto,
              estado: estadoInc as "abierta" | "en_revision" | "resuelta",
              resueltaEn: estadoInc === "resuelta" ? fin : null,
            });
            nIncidencias++;
          }
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
  Incidencias y oportunidades .... ${nIncidencias}
  Justificaciones ................ ${nJustificaciones}

  Historial de ${DIAS_HISTORIAL} días. El día de hoy queda a medias a propósito:
  una visita cerrada, una en curso y el resto pendientes.
`);

  await conexion.end();
}

principal().catch((error) => {
  console.error("\nFallo generando datos de prueba:", error);
  process.exit(1);
});
