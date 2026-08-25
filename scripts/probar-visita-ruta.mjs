/**
 * Verifica cinco cambios que se tocan entre sí:
 *
 *  1. La búsqueda de tienda funciona por código 350… y por nombre, y está
 *     acotada al alcance del GPV.
 *  2. Una visita fuera de ruta se incorpora a la ruta del día conservando
 *     `planificada = false`.
 *  3. Cerrar una visita ya no la marca como incompleta.
 *  4. El FSM ve un aviso cuando un GPV cierra una acción que le tocaba.
 *  5. La duración de visita no sale por ninguna respuesta.
 *
 * El punto 2 es el que más fácil se rompe: si la visita se incorpora a la ruta
 * y además sigue contando como "suelta", aparece DOS VECES en la vista del día.
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

async function entrar(numero, intento = 0) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroTrabajador: numero, password: "SalesWatcher2026!" }),
  });
  if (r.status === 429 && intento < 3) {
    await new Promise((l) => setTimeout(l, (intento + 1) * 20_000));
    return entrar(numero, intento + 1);
  }
  const cuerpo = await r.json();
  if (!cuerpo.token) throw new Error(`login de ${numero}: ${JSON.stringify(cuerpo)}`);
  return cuerpo.token;
}

const pedir = async (token, ruta, opciones = {}) => {
  const r = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opciones.headers ?? {}),
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  return { estado: r.status, datos };
};

let visitaCreada = null;

try {
  const gpv = await entrar("30001");
  const fsm = await entrar("20001");

  // ── 1. Búsqueda por código y por nombre ──────────────────────────────
  console.log("\nBúsqueda de tienda");
  const porCodigo = await pedir(gpv, "/tiendas?texto=350100105&limite=10");
  ok(
    "por código 350…",
    porCodigo.datos.tiendas.length === 1 &&
      porCodigo.datos.tiendas[0].tienda.numeroReferencia === "350100105",
    porCodigo.datos.tiendas[0]?.tienda?.nombre,
  );

  const porNombre = await pedir(gpv, "/tiendas?texto=Motril&limite=10");
  ok(
    "por nombre, al mismo nivel",
    porNombre.datos.tiendas.length >= 1 &&
      porNombre.datos.tiendas[0].tienda.numeroReferencia === "350100105",
    `${porNombre.datos.tiendas.length} resultado(s)`,
  );

  // Un GPV no puede ampliar su alcance pidiendo otra zona.
  const otraZona = await pedir(gpv, "/tiendas?zonaId=00000000-0000-0000-0000-000000000000&limite=50");
  const [{ zona_id: zonaDelGpv }] = await sql`
    select zona_id from usuarios where numero_trabajador = '30001'`;
  const todasDeSuZona = otraZona.datos.tiendas.every((t) => t.tienda.zonaId === zonaDelGpv);
  ok(
    "el GPV no puede ampliar su alcance",
    todasDeSuZona,
    `${otraZona.datos.tiendas.length} tienda(s), todas de su zona`,
  );

  // ── 2. Visita fuera de ruta → entra en la ruta del día ───────────────
  console.log("\nVisita fuera de ruta");
  const diaAntes = await pedir(gpv, "/visitas/dia");
  const yaEnRuta = new Set(diaAntes.datos.visitas.map((v) => v.tienda.numeroReferencia));
  const candidata = (await pedir(gpv, "/tiendas?limite=50")).datos.tiendas
    .map((t) => t.tienda)
    .find((t) => !yaEnRuta.has(t.numeroReferencia));
  if (!candidata) throw new Error("todas las tiendas están ya en la ruta de hoy");

  const creada = await pedir(gpv, "/visitas", {
    method: "POST",
    cuerpo: { tiendaId: candidata.id },
  });
  ok("visita creada", creada.estado === 201 || creada.estado === 200, `HTTP ${creada.estado}`);
  visitaCreada = creada.datos?.id;

  const [fila] = await sql`
    select planificada, ruta_diaria_id from visitas where id = ${visitaCreada}`;
  ok("se incorpora a la ruta", fila.ruta_diaria_id !== null, "tiene ruta_diaria_id");
  ok(
    "pero NO cuenta como planificada",
    fila.planificada === false,
    "la cobertura sigue midiendo algo",
  );

  const diaDespues = await pedir(gpv, "/visitas/dia");
  const apariciones = diaDespues.datos.visitas.filter(
    (v) => v.tienda.numeroReferencia === candidata.numeroReferencia,
  );
  ok(
    "aparece UNA sola vez en el día",
    apariciones.length === 1,
    `${apariciones.length} aparición(es) — duplicarla sería el fallo obvio`,
  );
  ok(
    "y etiquetada como no planificada",
    apariciones[0]?.planificada === false,
    `planificada: ${apariciones[0]?.planificada}`,
  );
  ok(
    "el día tiene una visita más",
    diaDespues.datos.visitas.length === diaAntes.datos.visitas.length + 1,
    `${diaAntes.datos.visitas.length} → ${diaDespues.datos.visitas.length}`,
  );

  // ── 3. Cierre sin mínimos ────────────────────────────────────────────
  console.log("\nCierre sin mínimos obligatorios");
  await pedir(gpv, `/visitas/${visitaCreada}/comenzar`, { method: "POST", cuerpo: {} });
  const cerrada = await pedir(gpv, `/visitas/${visitaCreada}/finalizar`, {
    method: "POST",
    cuerpo: {},
  });
  ok("cierra sin completar nada", cerrada.estado === 200, `HTTP ${cerrada.estado}`);
  ok("no se marca incompleta", cerrada.datos?.incompleta === false);

  const [tras] = await sql`select incompleta from visitas where id = ${visitaCreada}`;
  ok("ni en base de datos", tras.incompleta === false);

  // ── 5. La duración no sale por ninguna respuesta ─────────────────────
  console.log("\nDuración de visita");
  ok(
    "no viene al finalizar",
    cerrada.datos?.duracionMinutos === undefined,
    "el dato se registra pero no sale",
  );

  const ejecucion = await pedir(fsm, "/informes/ejecucion?desde=2026-01-01&hasta=2026-12-31");
  ok("no viene en el informe de ejecución", ejecucion.datos?.duracion === undefined);

  /**
   * Las exportaciones que SI existen.
   *
   * La primera version de esta comprobacion pedia `ejecucion.csv`, que no
   * existe: la respuesta no era `ok`, el texto quedaba vacio y el aserto pasaba
   * sin comprobar nada. Un test que pasa por vacio es peor que no tenerlo.
   */
  for (const nombre of ["cobertura", "no-realizacion"]) {
    const csv = await fetch(
      `${BASE}/informes/${nombre}.csv?desde=2026-01-01&hasta=2026-12-31`,
      { headers: { Authorization: `Bearer ${fsm}` } },
    );
    const texto = csv.ok ? await csv.text() : null;
    ok(
      `sin duracion en ${nombre}.csv`.padEnd(32),
      texto !== null && !/duraci[on]n|minutos/i.test(texto),
      texto === null
        ? "el CSV no respondio: la comprobacion no vale"
        : `${texto.split("\n").length} linea(s) revisadas`,
    );
  }

  // Y sigue estando en la tabla, por si el cliente lo pide algún día.
  const [marcas] = await sql`
    select count(*)::int as n from visitas
    where hora_inicio is not null and hora_fin is not null`;
  ok("pero el dato sigue registrado", marcas.n > 0, `${marcas.n} visitas con ambas marcas`);

  // ── 4. Aviso al FSM ──────────────────────────────────────────────────
  console.log("\nAviso al FSM");
  const [accionDelFsm] = await sql`
    select a.id from acciones a
    where a.responsable_actuar = 'fsm' and a.estado in ('abierta','en_curso')
    limit 1`;
  if (!accionDelFsm) throw new Error("no hay acciones abiertas del FSM");

  const [gpvId] = await sql`select id from usuarios where numero_trabajador = '30001'`;
  await sql`
    update acciones set estado = 'resuelta', resuelta_en = now(),
      cerrada_por = ${gpvId.id}, cerrada_por_rol = 'comercial'
    where id = ${accionDelFsm.id}`;

  const aviso = await pedir(fsm, "/acciones/cerradas-por-gpv");
  ok("el FSM cuenta los cierres del GPV", aviso.datos?.total >= 1, `${aviso.datos?.total}`);

  const filtradas = await pedir(fsm, "/acciones?cerradasPorGpv=true&limite=50");
  ok(
    "y puede listarlas",
    filtradas.datos.length >= 1 &&
      filtradas.datos.every((a) => a.responsableActuar === "fsm"),
    `${filtradas.datos.length} acción(es)`,
  );

  // Sin el filtro no aparecen: es justo el motivo de que el aviso exista.
  const bandeja = await pedir(fsm, "/acciones?limite=200");
  ok(
    "no aparecen en la bandeja normal",
    !bandeja.datos.some((a) => a.id === accionDelFsm.id),
    "por eso hace falta avisar",
  );

  await sql`
    update acciones set estado = 'abierta', resuelta_en = null,
      cerrada_por = null, cerrada_por_rol = null
    where id = ${accionDelFsm.id}`;
} catch (error) {
  console.error("\nError:", error.message);
  fallos++;
} finally {
  if (visitaCreada) {
    const [v] = await sql`select ruta_diaria_id from visitas where id = ${visitaCreada}`;
    await sql`delete from visitas where id = ${visitaCreada}`;
    if (v?.ruta_diaria_id) {
      await sql`delete from rutas_diarias where id = ${v.ruta_diaria_id}`;
    }
  }
  console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} FALLO(S).\n`);
  await sql.end();
  process.exit(fallos === 0 ? 0 : 1);
}
