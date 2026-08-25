/**
 * Ejercita el ciclo detección → acción → comprobación → resultado contra la
 * base de datos real.
 *
 * No comprueba que el esquema compile —eso ya lo hace `typecheck`—, sino que el
 * modelo aguanta el uso que se le va a dar: una acción por cada flujo con su
 * detalle, el responsable que calcula `@sw/shared` coincidiendo con el que se
 * almacena, comprobaciones acumulándose sin sobreescribirse, y la derivación de
 * "estancada" saliendo de la antigüedad y no de una columna.
 *
 * Deja la base de datos como la encontró.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
// El motor de reglas real, no una copia: el objetivo es contrastar lo que
// calcula `@sw/shared` con lo que acaba en la base de datos.
import { resolverResponsable } from "../packages/shared/dist/index.js";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DATABASE_URL) {
  const rutaEnv = resolve(raiz, ".env");
  if (existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Copia .env.example a .env.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

// Reproducción de la tabla del boceto (SPECS §5.4) para contrastar contra lo
// que la base de datos acaba guardando. Si el motor de reglas y esta tabla
// divergen, es que uno de los dos se tocó sin tocar el otro.
const ESPERADO = {
  "stock/dairy": "fsm",
  "stock/waters": "gpv",
  "fechas/dairy": "fsm",
  "hueco/dairy": "fsm",
  "hueco/pbb": "gpv",
  "top_pico/dairy": "fsm",
  "top_pico/waters": "gpv",
  "facings/dairy": "gpv",
  "visibilidad/dairy": "fsm",
  "visibilidad/waters": "gpv",
  "reorganizacion/pbb": "fsm",
  "extraespacio/dairy": "gpv",
  "nevera/waters": "fsm",
};

let fallos = 0;
const ok = (etiqueta, condicion, detalle = "") => {
  console.log(`  ${condicion ? "OK  " : "FALLO"}  ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
  if (!condicion) fallos++;
};

/** La visita que crea este script. Solo se borra esta, nunca por filtro. */
let visitaId = null;

try {
  // ── Contexto: un GPV, su tienda y una visita ─────────────────────────
  const [gpv] = await sql`select id, zona_id from usuarios where numero_trabajador = '30001'`;
  const [fsm] = await sql`select id from usuarios where numero_trabajador = '20001'`;
  const [tienda] = await sql`select id, nombre from tiendas where numero_referencia = '350100101'`;
  if (!gpv || !tienda) throw new Error("faltan datos semilla: ejecuta pnpm db:seed");

  const [visita] = await sql`
    insert into visitas (usuario_id, tienda_id, fecha, estado, planificada, hora_inicio)
    values (${gpv.id}, ${tienda.id}, current_date, 'en_curso', false, now())
    returning id`;
  visitaId = visita.id;
  console.log(`\nVisita de prueba en ${tienda.nombre}\n`);

  // ── Una acción por combinación de la tabla del boceto ────────────────
  console.log("Responsable derivado por el servidor:");
  const accionesCreadas = {};
  for (const [clave, esperado] of Object.entries(ESPERADO)) {
    const [tipo, categoria] = clave.split("/");
    const regla = resolverResponsable(tipo, categoria);

    const [accion] = await sql`
      insert into acciones (
        tienda_id, visita_origen_id, categoria_producto, tipo_situacion,
        responsable_actuar, detectada_en, id_cliente
      ) values (
        ${tienda.id}, ${visita.id}, ${categoria}, ${tipo},
        ${regla.responsable}, now(), ${randomUUID()}
      ) returning id, responsable_actuar`;
    accionesCreadas[clave] = accion.id;

    ok(
      `${clave.padEnd(24)} → ${accion.responsable_actuar}`,
      accion.responsable_actuar === esperado && regla.responsable === esperado,
      regla.origen === "derivado" ? "regla derivada, sin confirmar" : "",
    );
  }

  // ── Detalle tipificado: una tabla por flujo ──────────────────────────
  console.log("\nDetalle por flujo:");

  await sql`insert into detecciones_stock (accion_id, suficiencia)
            values (${accionesCreadas["stock/dairy"]}, 'reponedor_no_ha_pasado')`;
  await sql`insert into detecciones_stock (accion_id, suficiencia, comunicado_al_responsable)
            values (${accionesCreadas["stock/waters"]}, 'no', true)`;
  await sql`insert into detecciones_fechas (accion_id, problema)
            values (${accionesCreadas["fechas/dairy"]}, 'fifo_incorrecto')`;
  await sql`insert into detecciones_hueco (accion_id, existe_hueco, cubierto_con_adyacente)
            values (${accionesCreadas["hueco/dairy"]}, true, false)`;
  await sql`insert into detecciones_hueco (accion_id, existe_hueco, correccion)
            values (${accionesCreadas["hueco/pbb"]}, true, 'si')`;

  const [ref] = await sql`select id from referencias_producto where codigo = 'act-nat-4x125'`;
  await sql`insert into top_picos_pendientes (accion_id, referencia_id)
            values (${accionesCreadas["top_pico/dairy"]}, ${ref.id})`;

  const [marca] = await sql`select id from marcas where codigo = 'activia'`;
  await sql`insert into ganancias_facings (accion_id, marca_id, conseguido, facings_ganados)
            values (${accionesCreadas["facings/dairy"]}, ${marca.id}, true, 2)`;
  await sql`insert into oportunidades_visibilidad (accion_id, marca_id, ubicacion_actual, propuesta)
            values (${accionesCreadas["visibilidad/dairy"]}, ${marca.id}, 'palomar', 'bajar_producto')`;
  await sql`insert into oportunidades_reorganizacion (accion_id, propuesta)
            values (${accionesCreadas["reorganizacion/pbb"]}, 'Agrupar todo el vegetal en un solo bloque')`;

  const [extra] = await sql`insert into extraespacios (accion_id, tipo, motivo)
            values (${accionesCreadas["extraespacio/dairy"]}, 'cabecera', 'alta_rotacion')
            returning id`;
  const [extraNevera] = await sql`insert into extraespacios (accion_id, tipo, motivo)
            values (${accionesCreadas["nevera/waters"]}, 'nevera', 'potencial_venta')
            returning id`;
  await sql`insert into neveras (extraespacio_id, situacion, codigo_nevera)
            values (${extraNevera.id}, 'necesita_recogida', 'NV-0012-ALM')`;
  ok("nueve flujos con su detalle", true);

  // El código de nevera se guarda tal cual: es la clave con la que el FSM
  // informa en su propia aplicación de neveras.
  const [nev] = await sql`select codigo_nevera from neveras where extraespacio_id = ${extraNevera.id}`;
  ok("código de nevera sin normalizar", nev.codigo_nevera === "NV-0012-ALM", nev.codigo_nevera);

  // ── Relación con el responsable: una por visita ──────────────────────
  await sql`insert into relaciones_responsable (visita_id, ha_hablado, valoracion, cuestion_pendiente)
            values (${visita.id}, true, 'buena', false)`;
  let duplicadaRechazada = false;
  try {
    await sql`insert into relaciones_responsable (visita_id, ha_hablado) values (${visita.id}, false)`;
  } catch {
    duplicadaRechazada = true;
  }
  ok("la relación es única por visita", duplicadaRechazada);

  // ── Comprobaciones: se acumulan, no se sobreescriben ─────────────────
  const accionSeguida = accionesCreadas["top_pico/dairy"];
  await sql`insert into comprobaciones_accion (accion_id, visita_id, usuario_id, desenlace, comprobada_en)
            values (${accionSeguida}, ${visita.id}, ${gpv.id}, 'sigue_pendiente', now() - interval '8 days')`;
  await sql`insert into comprobaciones_accion (accion_id, visita_id, usuario_id, desenlace, comprobada_en)
            values (${accionSeguida}, ${visita.id}, ${gpv.id}, 'sigue_pendiente', now() - interval '3 days')`;
  await sql`insert into comprobaciones_accion (accion_id, usuario_id, desenlace, comprobada_en)
            values (${accionSeguida}, ${fsm.id}, 'resuelta', now())`;

  const historial = await sql`
    select desenlace from comprobaciones_accion
    where accion_id = ${accionSeguida} order by comprobada_en`;
  ok(
    "el historial conserva las tres comprobaciones",
    historial.length === 3 && historial[2].desenlace === "resuelta",
    historial.map((h) => h.desenlace).join(" → "),
  );

  // ── Cierre: queda registrado quién y con qué rol ─────────────────────
  await sql`update acciones set estado = 'resuelta', resuelta_en = now(),
              cerrada_por = ${fsm.id}, cerrada_por_rol = 'supervisor'
            where id = ${accionSeguida}`;
  const [cerrada] = await sql`
    select a.estado, u.numero_trabajador, a.cerrada_por_rol
    from acciones a join usuarios u on u.id = a.cerrada_por where a.id = ${accionSeguida}`;
  ok(
    "el cierre registra autor y rol",
    cerrada.estado === "resuelta" && cerrada.cerrada_por_rol === "supervisor",
    `cerrada por ${cerrada.numero_trabajador} (${cerrada.cerrada_por_rol})`,
  );

  // ── Estancada: se deriva de la antigüedad, no hay columna ────────────
  const antigua = accionesCreadas["hueco/dairy"];
  await sql`update acciones set detectada_en = now() - interval '20 days' where id = ${antigua}`;
  const estancadas = await sql`
    select id from acciones
    where estado = 'abierta' and detectada_en < now() - (${14} || ' days')::interval`;
  ok(
    "estancada se deriva por antigüedad",
    estancadas.some((e) => e.id === antigua) && estancadas.length === 1,
    `${estancadas.length} estancada(s) de ${Object.keys(ESPERADO).length}`,
  );

  const columnaEstancada = await sql`
    select 1 from information_schema.columns
    where table_name = 'acciones' and column_name = 'estancada'`;
  ok("no existe columna estancada", columnaEstancada.length === 0);

  // ── La acción pertenece a la tienda, no a la visita ──────────────────
  const abiertasDeTienda = await sql`
    select count(*)::int n from acciones where tienda_id = ${tienda.id} and estado = 'abierta'`;
  ok(
    "las acciones abiertas se consultan por tienda",
    abiertasDeTienda[0].n === Object.keys(ESPERADO).length - 1,
    `${abiertasDeTienda[0].n} abiertas`,
  );

  // ── Idempotencia offline ─────────────────────────────────────────────
  const idRepetido = randomUUID();
  await sql`insert into acciones (tienda_id, visita_origen_id, categoria_producto,
              tipo_situacion, responsable_actuar, id_cliente)
            values (${tienda.id}, ${visita.id}, 'waters', 'facings', 'gpv', ${idRepetido})`;
  let repetidoRechazado = false;
  try {
    await sql`insert into acciones (tienda_id, visita_origen_id, categoria_producto,
                tipo_situacion, responsable_actuar, id_cliente)
              values (${tienda.id}, ${visita.id}, 'waters', 'facings', 'gpv', ${idRepetido})`;
  } catch {
    repetidoRechazado = true;
  }
  ok("id_cliente repetido se rechaza", repetidoRechazado);
} finally {
  // ── Limpieza: deja la base como estaba ───────────────────────────────
  // Se borra SOLO lo que creó este script, identificado por su visita.
  //
  // La primera versión borraba visitas por filtro (`planificada = false and
  // estado = 'en_curso'`), que también describe visitas legítimas de
  // `db:pruebas`. Coincidió que no había ninguna, pero era cuestión de tiempo.
  if (visitaId) {
    const mias = sql`select id from acciones where visita_origen_id = ${visitaId}`;

    await sql`delete from neveras where extraespacio_id in (
                select id from extraespacios where accion_id in (${mias}))`;
    for (const tabla of [
      "detecciones_stock", "detecciones_fechas", "detecciones_hueco",
      "top_picos_pendientes", "ganancias_facings",
      "oportunidades_visibilidad", "oportunidades_reorganizacion", "extraespacios",
    ]) {
      await sql.unsafe(
        `delete from ${tabla} where accion_id in (select id from acciones where visita_origen_id = $1)`,
        [visitaId],
      );
    }
    await sql`delete from comprobaciones_accion where accion_id in (${mias})`;
    await sql`delete from relaciones_responsable where visita_id = ${visitaId}`;
    await sql`delete from acciones where visita_origen_id = ${visitaId}`;
    await sql`delete from visitas where id = ${visitaId}`;
  }

  const restos = await sql`select
      (select count(*)::int from acciones) acciones,
      (select count(*)::int from comprobaciones_accion) comprobaciones,
      (select count(*)::int from visitas) visitas`;
  console.log(
    `\nLimpieza: ${restos[0].acciones} acciones, ${restos[0].comprobaciones} comprobaciones, ${restos[0].visitas} visitas.`,
  );
  console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} FALLO(S).\n`);
  await sql.end();
  process.exit(fallos === 0 ? 0 : 1);
}
