/**
 * Verifica el dashboard de resultados contra la base de datos.
 *
 * Un agregado que devuelve un número no demuestra nada por sí solo: podría
 * estar contando lo que no es. Aquí cada respuesta de la API se contrasta con
 * una consulta SQL independiente, escrita a mano y por otro camino.
 *
 * No modifica nada: solo lee.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DATABASE_URL) {
  const rutaEnv = resolve(raiz, ".env");
  if (existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);
}

const BASE = `http://localhost:${process.env.PORT ?? 3900}/api`;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

let fallos = 0;
const ok = (etiqueta, condicion, detalle = "") => {
  console.log(`  ${condicion ? "OK  " : "FALLO"}  ${etiqueta}${detalle ? ` - ${detalle}` : ""}`);
  if (!condicion) fallos++;
};

/**
 * El login lleva throttle por IP a propósito, así que encadenar varios scripts
 * seguidos puede toparse con un 429. Es la protección funcionando, no un fallo:
 * se espera y se reintenta en vez de bajarle el listón a la API.
 */
async function entrar(numero, intento = 0) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroTrabajador: numero, password: "SalesWatcher2026!" }),
  });

  if (r.status === 429 && intento < 3) {
    const espera = (intento + 1) * 20_000;
    console.log(`  (throttle de login; esperando ${espera / 1000}s)`);
    await new Promise((listo) => setTimeout(listo, espera));
    return entrar(numero, intento + 1);
  }

  const cuerpo = await r.json();
  if (!cuerpo.token) throw new Error(`login de ${numero}: ${JSON.stringify(cuerpo)}`);
  return cuerpo.token;
}

const pedir = async (token, ruta) => {
  const r = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  return { estado: r.status, datos: await r.json() };
};

/** Periodo amplio: cubre todo el historial que genera `db:pruebas`. */
const DESDE = "2026-01-01";
const HASTA = "2026-12-31";
const P = `desde=${DESDE}&hasta=${HASTA}`;

try {
  const admin = await entrar("10000");
  const fsm = await entrar("20001");
  const gpv = await entrar("30001");

  // ── El embudo es una cohorte, no tres contadores ─────────────────────
  console.log("\nEmbudo (preguntas 1-3)");
  const embudo = (await pedir(admin, `/resultados/embudo?${P}`)).datos;

  const [esperadoEmbudo] = await sql`
    select
      count(*)::int as detectadas,
      count(*) filter (where a.estado = 'resuelta')::int as solucionadas,
      count(*) filter (
        where a.estado = 'abierta'
          and not exists (select 1 from comprobaciones_accion c where c.accion_id = a.id)
      )::int as sin_tocar
    from acciones a
    join visitas v on v.id = a.visita_origen_id
    where a.tipo_situacion in ('top_pico','facings','visibilidad','reorganizacion')
      and v.fecha between ${DESDE} and ${HASTA}`;

  ok(
    "detectadas coincide con SQL",
    embudo.detectadas === esperadoEmbudo.detectadas,
    `API ${embudo.detectadas} vs SQL ${esperadoEmbudo.detectadas}`,
  );
  ok(
    "solucionadas coincide con SQL",
    embudo.solucionadas === esperadoEmbudo.solucionadas,
    `API ${embudo.solucionadas} vs SQL ${esperadoEmbudo.solucionadas}`,
  );
  ok(
    "sin tocar coincide con SQL",
    embudo.sinTocar === esperadoEmbudo.sin_tocar,
    `API ${embudo.sinTocar} vs SQL ${esperadoEmbudo.sin_tocar}`,
  );

  // La propiedad que define un embudo: cada escalón cabe en el anterior.
  ok(
    "el embudo no se ensancha",
    embudo.solucionadas <= embudo.trabajadas && embudo.trabajadas <= embudo.detectadas,
    `${embudo.detectadas} > ${embudo.trabajadas} > ${embudo.solucionadas}`,
  );
  ok(
    "las partes cuadran con el total",
    embudo.trabajadas + embudo.sinTocar === embudo.detectadas,
    `${embudo.trabajadas} + ${embudo.sinTocar} = ${embudo.detectadas}`,
  );
  ok(
    "la tasa de conversión es coherente",
    embudo.tasaConversion === Math.round((embudo.solucionadas / embudo.detectadas) * 100),
    `${embudo.tasaConversion}%`,
  );

  // Solo cuenta oportunidades: las incidencias no entran en este embudo.
  const [incidenciasFuera] = await sql`
    select count(*)::int as n from acciones
    where tipo_situacion in ('stock','fechas','hueco')`;
  ok(
    "las incidencias quedan fuera del embudo",
    embudo.detectadas < (await sql`select count(*)::int as n from acciones`)[0].n,
    `${incidenciasFuera.n} incidencias excluidas`,
  );

  // ── Facings: la única cifra que se suma ──────────────────────────────
  console.log("\nFacings ganados (pregunta 4)");
  const [esperadoFacings] = await sql`
    select coalesce(sum(g.facings_ganados), 0)::int as total
    from ganancias_facings g
    join acciones a on a.id = g.accion_id
    join visitas v on v.id = a.visita_origen_id
    where g.conseguido = true and v.fecha between ${DESDE} and ${HASTA}`;

  for (const dimension of ["gpv", "tienda", "categoria", "marca", "mes"]) {
    const r = (await pedir(admin, `/resultados/facings?${P}&dimension=${dimension}`)).datos;
    const suma = r.filas.reduce((s, f) => s + f.facings, 0);
    ok(
      `desglose por ${dimension}`.padEnd(24),
      r.total === esperadoFacings.total && suma === esperadoFacings.total,
      `${r.filas.length} filas suman ${suma}, esperado ${esperadoFacings.total}`,
    );
  }

  // Todas las dimensiones parten del mismo total: si una difiere, está
  // duplicando filas por un join mal puesto.
  const porMarca = (await pedir(admin, `/resultados/facings?${P}&dimension=marca`)).datos;
  ok(
    "el desglose por marca no duplica",
    porMarca.total === esperadoFacings.total,
    `${porMarca.total} vs ${esperadoFacings.total}`,
  );

  // ── Top Picos: base temporal distinta, y se declara ──────────────────
  console.log("\nTop Picos (pregunta 5)");
  const topPicos = (await pedir(admin, `/resultados/top-picos?${P}`)).datos;
  const [esperadoTop] = await sql`
    select count(*)::int as n from top_picos_pendientes
    where incorporada = true and incorporada_en::date between ${DESDE} and ${HASTA}`;
  ok(
    "incorporados coincide con SQL",
    topPicos.incorporados === esperadoTop.n,
    `API ${topPicos.incorporados} vs SQL ${esperadoTop.n}`,
  );
  ok(
    "declara su base temporal",
    topPicos.base === "fecha de incorporación",
    topPicos.base,
  );

  // ── Patrones: solo funcionan porque está tipificado ──────────────────
  console.log("\nPatrones (preguntas 6-7)");
  const patrones = (await pedir(admin, `/resultados/patrones?${P}&minimoRepeticiones=2`)).datos;
  ok(
    "stock repetido: ninguno por debajo del mínimo",
    patrones.stockRepetido.every((f) => f.veces >= 2),
    `${patrones.stockRepetido.length} combinaciones tienda/categoría`,
  );
  ok(
    "tiendas recurrentes ordenadas de más a menos",
    patrones.tiendasRecurrentes.every(
      (f, i) => i === 0 || patrones.tiendasRecurrentes[i - 1].incidencias >= f.incidencias,
    ),
    `${patrones.tiendasRecurrentes.length} tiendas`,
  );

  // Subir el umbral solo puede reducir el resultado.
  const masExigente = (await pedir(admin, `/resultados/patrones?${P}&minimoRepeticiones=4`)).datos;
  ok(
    "un umbral más alto filtra más",
    masExigente.stockRepetido.length <= patrones.stockRepetido.length,
    `${patrones.stockRepetido.length} con 2, ${masExigente.stockRepetido.length} con 4`,
  );

  // ── Seguimiento: sin filtro de periodo, a propósito ──────────────────
  console.log("\nSeguimiento (pregunta 8)");
  const seg = (await pedir(admin, `/resultados/seguimiento?${P}`)).datos;
  const [esperadoAbiertas] = await sql`
    select count(*)::int as n from acciones where estado in ('abierta','en_curso')`;
  ok(
    "abiertas coincide con SQL",
    seg.abiertas === esperadoAbiertas.n,
    `API ${seg.abiertas} vs SQL ${esperadoAbiertas.n}`,
  );
  ok("las estancadas son subconjunto", seg.estancadas <= seg.abiertas, `${seg.estancadas} de ${seg.abiertas}`);
  ok(
    "las más viejas superan el umbral",
    seg.masViejas.every((a) => a.dias >= seg.umbralDias),
    `umbral ${seg.umbralDias} días, la mayor ${seg.masAntiguaDias}`,
  );
  ok(
    "ordenadas de más antigua a menos",
    seg.masViejas.every((a, i) => i === 0 || seg.masViejas[i - 1].dias >= a.dias),
  );

  // ── Equipo: detección y resultado en la misma fila ───────────────────
  console.log("\nEquipo (preguntas 9-10)");
  const equipo = (await pedir(admin, `/resultados/equipo?${P}`)).datos;
  ok("una fila por GPV", equipo.length === 6, `${equipo.length} GPVs`);
  ok(
    "cada fila trae detección Y resultado",
    equipo.every(
      (g) =>
        typeof g.detectadas === "number" &&
        typeof g.resueltas === "number" &&
        typeof g.facings === "number",
    ),
    "no se puede leer una sin la otra",
  );
  ok(
    "propias + escaladas = detectadas",
    equipo.every((g) => g.propias + g.escaladas === g.detectadas),
  );
  ok(
    "oportunidades + incidencias no supera el total",
    equipo.every((g) => g.oportunidades + g.incidencias <= g.detectadas),
  );

  const sumaDetectadas = equipo.reduce((s, g) => s + g.detectadas, 0);
  const [totalAcciones] = await sql`
    select count(*)::int as n from acciones a
    join visitas v on v.id = a.visita_origen_id
    where v.fecha between ${DESDE} and ${HASTA}`;
  ok(
    "el equipo suma todas las acciones",
    sumaDetectadas === totalAcciones.n,
    `${sumaDetectadas} vs ${totalAcciones.n}`,
  );

  const sumaFacings = equipo.reduce((s, g) => s + g.facings, 0);
  ok(
    "los facings del equipo cuadran con el total",
    sumaFacings === esperadoFacings.total,
    `${sumaFacings} vs ${esperadoFacings.total}`,
  );

  // ── Pérdidas: la lectura se declara ──────────────────────────────────
  console.log("\nPérdidas (pregunta 11)");
  const perdidas = (await pedir(admin, `/resultados/perdidas?${P}`)).datos;
  ok("declara su lectura", typeof perdidas.lectura === "string", perdidas.lectura);
  ok(
    "solo tiendas con algo sin resultado",
    perdidas.porTiendaYCategoria.every((t) => t.sinResultado > 0),
    `${perdidas.porTiendaYCategoria.length} tiendas`,
  );
  ok(
    "sin resultado nunca supera lo detectado",
    perdidas.porTiendaYCategoria.every((t) => t.sinResultado <= t.detectadas),
  );
  ok(
    "facings no conseguidos es subconjunto",
    perdidas.facings.noConseguidas <= perdidas.facings.detectadas,
    `${perdidas.facings.noConseguidas} de ${perdidas.facings.detectadas}`,
  );

  // ── El panel completo ────────────────────────────────────────────────
  console.log("\nPanel completo y control de acceso");
  const panel = (await pedir(admin, `/resultados?${P}`)).datos;
  ok(
    "el panel trae las once respuestas",
    !!panel.embudo && !!panel.logros && !!panel.patrones &&
      !!panel.seguimiento && !!panel.equipo && !!panel.perdidas,
  );
  ok(
    "el panel coincide con las partes",
    panel.embudo.detectadas === embudo.detectadas &&
      panel.logros.facings === esperadoFacings.total,
    `embudo ${panel.embudo.detectadas}, facings ${panel.logros.facings}`,
  );

  // ── Ámbito por rol ───────────────────────────────────────────────────
  const delGpv = await pedir(gpv, `/resultados?${P}`);
  ok("el GPV no accede al panel", delGpv.estado === 403, `HTTP ${delGpv.estado}`);

  const delFsm = (await pedir(fsm, `/resultados/equipo?${P}`)).datos;
  const [zonaFsm] = await sql`select zona_id from usuarios where numero_trabajador = '20001'`;
  const gpvsDeLaZona = await sql`
    select count(*)::int as n from usuarios
    where rol = 'comercial' and zona_id = ${zonaFsm.zona_id} and activo = true`;
  /**
   * OJO: con una sola zona en la operación actual, esta comprobación pasa por
   * vacío — no hay GPVs fuera que excluir. Fija el comportamiento para cuando
   * haya más zonas, pero hoy no demuestra aislamiento. El filtro real está
   * probado en `probar-api-acciones.mjs`, donde el GPV recibe un 403.
   */
  ok(
    "el FSM ve los GPVs de su zona",
    delFsm.length === gpvsDeLaZona[0].n,
    `${delFsm.length} de ${gpvsDeLaZona[0].n}${gpvsDeLaZona[0].n === delFsm.length && (await sql`select count(*)::int as n from zonas`)[0].n === 1 ? " (una sola zona: no prueba aislamiento)" : ""}`,
  );

  // ── Periodo vacío ────────────────────────────────────────────────────
  const vacio = (await pedir(admin, "/resultados/embudo?desde=2020-01-01&hasta=2020-01-31")).datos;
  ok(
    "un periodo sin datos no revienta",
    vacio.detectadas === 0 && vacio.tasaConversion === null,
    "tasa null en vez de división por cero",
  );
} catch (error) {
  console.error("\nError:", error.message);
  fallos++;
} finally {
  console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} FALLO(S).\n`);
  await sql.end();
  process.exit(fallos === 0 ? 0 : 1);
}
