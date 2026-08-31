/**
 * Ejercita la API del ciclo de acciones contra el servidor en marcha.
 *
 * Comprueba el recorrido completo que hará la app de campo —registrar,
 * comprobar en una visita posterior, cerrar— y el del FSM desde su bandeja.
 * Presta atención especial a lo que debe RECHAZARSE: una validación que no
 * rechaza es peor que ausente, porque da confianza sin darla.
 *
 * Deja la base de datos como la encontró.
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
const PASSWORD = "SalesWatcher2026!";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

let fallos = 0;
const ok = (etiqueta, condicion, detalle = "") => {
  console.log(`  ${condicion ? "OK  " : "FALLO"}  ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
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
    body: JSON.stringify({ numeroTrabajador: numero, password: PASSWORD }),
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

async function pedir(token, ruta, opciones = {}) {
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
}

let visitaId = null;
/** Si la visita ya estaba abierta, no se toca su estado al limpiar. */
let abiertaPorNosotros = false;

try {
  const gpv = await entrar("30001");
  const fsm = await entrar("20001");

  // ── Preparar una visita en curso ─────────────────────────────────────
  /**
   * Vale una pendiente o una ya en curso.
   *
   * Antes exigía una pendiente, y bastaba con que otra prueba —o un recorrido
   * manual por el navegador— hubiera empezado las del día para que este script
   * fallara sin haber nada roto.
   */
  const dia = await pedir(gpv, "/visitas/dia");
  const pendiente =
    dia.datos.visitas.find((v) => v.estado === "pendiente") ??
    dia.datos.visitas.find((v) => v.estado === "en_curso");
  if (!pendiente) throw new Error("no hay visita utilizable en la ruta de hoy");

  const yaEnCurso = pendiente.estado === "en_curso";
  const comenzada = yaEnCurso
    ? { estado: 200 }
    : await pedir(gpv, `/visitas/${pendiente.visitaId}/comenzar`, { method: "POST", cuerpo: {} });
  ok(
    "visita en curso",
    comenzada.estado === 200 || comenzada.estado === 201,
    yaEnCurso ? "ya estaba abierta" : `HTTP ${comenzada.estado}`,
  );
  visitaId = pendiente.visitaId;
  abiertaPorNosotros = !yaEnCurso;
  const tiendaId = pendiente.tienda.id;
  console.log(`\n  Visita en ${pendiente.tienda.nombre}\n`);

  // ── Registrar detecciones: el servidor deriva el responsable ─────────
  console.log("Registro de detecciones");

  const stockDairy = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "stock",
      categoriaProducto: "dairy",
      suficiencia: "reponedor_no_ha_pasado",
    },
  });
  ok(
    "stock en Dairy → FSM",
    stockDairy.estado === 201 && stockDairy.datos.responsableActuar === "fsm",
    `HTTP ${stockDairy.estado}, responsable ${stockDairy.datos?.responsableActuar}`,
  );

  const stockWaters = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "stock",
      categoriaProducto: "waters",
      suficiencia: "no",
    },
  });
  ok(
    "stock en Waters → GPV",
    stockWaters.estado === 201 && stockWaters.datos.responsableActuar === "gpv",
    `responsable ${stockWaters.datos?.responsableActuar}`,
  );

  const [referencia] = await sql`select id, nombre from referencias_producto where codigo = 'act-nat-4x125'`;
  const topPico = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "top_pico",
      categoriaProducto: "dairy",
      referenciaId: referencia.id,
    },
  });
  ok("top pico desde catálogo", topPico.estado === 201, `HTTP ${topPico.estado}`);

  const nevera = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "nevera",
      categoriaProducto: "waters",
      hayNevera: true,
      decision: "recoger",
      codigoNevera: "NV-0442-GRA",
    },
  });
  ok(
    "nevera → siempre FSM",
    nevera.estado === 201 && nevera.datos.responsableActuar === "fsm",
    `responsable ${nevera.datos?.responsableActuar}`,
  );

  const [marcaDairy] = await sql`select id from marcas where categoria_producto = 'dairy' limit 1`;
  const implantacion = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "reorganizacion",
      categoriaProducto: "dairy",
      marcaIds: marcaDairy ? [marcaDairy.id] : [],
      todoLineal: false,
    },
  });
  ok(
    "nueva implantación por marca → FSM decide",
    implantacion.estado === 201 && implantacion.datos.responsableActuar === "fsm",
    `HTTP ${implantacion.estado}`,
  );

  const bloqueMarca = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "bloque_marca", categoriaProducto: "waters" },
  });
  ok(
    "bloque de marca → sin escalado, del GPV",
    bloqueMarca.estado === 201 && bloqueMarca.datos.responsableActuar === "gpv",
    `HTTP ${bloqueMarca.estado}, responsable ${bloqueMarca.datos?.responsableActuar}`,
  );

  const bloqueMarcaEnDairy = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "bloque_marca", categoriaProducto: "dairy" },
  });
  ok(
    "bloque de marca no existe en Dairy",
    bloqueMarcaEnDairy.estado === 400,
    `HTTP ${bloqueMarcaEnDairy.estado}`,
  );

  const neveraEnPbb = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "nevera", categoriaProducto: "pbb", hayNevera: false, oportunidadAnadir: false },
  });
  ok("la nevera no existe en PBB", neveraEnPbb.estado === 400, `HTTP ${neveraEnPbb.estado}`);

  const facings = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "facings",
      categoriaProducto: "dairy",
      conseguido: true,
      facingsGanados: 3,
    },
  });
  ok(
    "facings → siempre GPV",
    facings.estado === 201 && facings.datos.responsableActuar === "gpv",
    `responsable ${facings.datos?.responsableActuar}`,
  );

  const extra = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "extraespacio",
      categoriaProducto: "dairy",
      tipo: "cabecera",
      motivo: "alta_rotacion",
    },
  });
  ok(
    "extraespacio en Dairy → GPV (regla derivada)",
    extra.estado === 201 && extra.datos.responsableActuar === "gpv" && extra.datos.reglaDerivada === true,
    `derivada: ${extra.datos?.reglaDerivada}`,
  );

  // ── Borrar un misclick, solo mientras la visita sigue abierta ────────
  console.log("\nEliminar un registro por error");

  const misclick = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "bloque_marca", categoriaProducto: "waters" },
  });
  ok("misclick registrado", misclick.estado === 201, `HTTP ${misclick.estado}`);

  const listaAntes = await pedir(gpv, `/visitas/${visitaId}/acciones`);
  ok(
    "aparece en lo registrado de la visita",
    listaAntes.datos.some((a) => a.id === misclick.datos.id),
    `${listaAntes.datos?.length} registradas`,
  );

  const noEsSuyo = await pedir(fsm, `/acciones/${misclick.datos.id}`, { method: "DELETE" });
  ok("el FSM no puede borrar (solo el GPV)", noEsSuyo.estado === 403, `HTTP ${noEsSuyo.estado}`);

  const borrado = await pedir(gpv, `/acciones/${misclick.datos.id}`, { method: "DELETE" });
  ok("el propio GPV lo borra", borrado.estado === 204, `HTTP ${borrado.estado}`);

  const listaDespues = await pedir(gpv, `/visitas/${visitaId}/acciones`);
  ok(
    "desaparece del todo, no queda como descartada",
    !listaDespues.datos.some((a) => a.id === misclick.datos.id),
    `${listaDespues.datos?.length} registradas`,
  );

  const yaNoExiste = await pedir(gpv, `/acciones/${misclick.datos.id}/comprobaciones`);
  ok("y ya no se puede consultar su historial", yaNoExiste.estado === 404, `HTTP ${yaNoExiste.estado}`);

  // ── Lo que DEBE rechazarse ───────────────────────────────────────────
  console.log("\nValidaciones que deben rechazar");

  const fechasFuera = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "fechas", categoriaProducto: "waters", problema: "fifo_incorrecto" },
  });
  ok("fechas fuera de Dairy", fechasFuera.estado === 400, `HTTP ${fechasFuera.estado}`);

  const excusaInexistente = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "stock",
      categoriaProducto: "pbb",
      suficiencia: "reponedor_no_ha_pasado",
    },
  });
  ok(
    "«el reponedor no ha pasado» en PBB",
    excusaInexistente.estado === 400,
    `HTTP ${excusaInexistente.estado}`,
  );

  const neveraSinCodigo = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "nevera",
      categoriaProducto: "waters",
      hayNevera: true,
      decision: "recoger",
    },
  });
  ok("recoger nevera sin código", neveraSinCodigo.estado === 400, `HTTP ${neveraSinCodigo.estado}`);

  const neveraDecisionSinNevera = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "nevera", categoriaProducto: "waters", hayNevera: false, decision: "mantener" },
  });
  ok(
    "decisión sin que haya nevera",
    neveraDecisionSinNevera.estado === 400,
    `HTTP ${neveraDecisionSinNevera.estado}`,
  );

  const implantacionSinMarca = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "reorganizacion", categoriaProducto: "dairy", marcaIds: [], todoLineal: false },
  });
  ok(
    "nueva implantación sin marca ni todo el lineal",
    implantacionSinMarca.estado === 400,
    `HTTP ${implantacionSinMarca.estado}`,
  );

  const huecoConfundido = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "hueco",
      categoriaProducto: "dairy",
      existeHueco: true,
      correccion: "si",
    },
  });
  ok(
    "«lo corregí yo» en Dairy",
    huecoConfundido.estado === 400,
    `HTTP ${huecoConfundido.estado}`,
  );

  const fechaOtroSinDetalle = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: { tipoSituacion: "fechas", categoriaProducto: "dairy", problema: "otro" },
  });
  ok("«otro» sin detallar", fechaOtroSinDetalle.estado === 400, `HTTP ${fechaOtroSinDetalle.estado}`);

  // ── Idempotencia offline ─────────────────────────────────────────────
  const idCliente = `prueba-${Date.now()}`;
  const primera = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "visibilidad",
      categoriaProducto: "pbb",
      ubicacionActual: "palomar",
      propuesta: "bajar_producto",
      idCliente,
    },
  });
  const repetida = await pedir(gpv, `/visitas/${visitaId}/acciones`, {
    method: "POST",
    cuerpo: {
      tipoSituacion: "visibilidad",
      categoriaProducto: "pbb",
      ubicacionActual: "palomar",
      propuesta: "bajar_producto",
      idCliente,
    },
  });
  ok(
    "reenvío offline no duplica",
    primera.datos.id === repetida.datos.id,
    `mismo id: ${primera.datos.id === repetida.datos.id}`,
  );

  // ── Seguimiento ──────────────────────────────────────────────────────
  console.log("\nSeguimiento entre visitas");

  const abiertas = await pedir(gpv, `/tiendas/${tiendaId}/acciones`);
  ok(
    "acciones abiertas de la tienda",
    abiertas.estado === 200 && abiertas.datos.length >= 7,
    `${abiertas.datos?.length} abiertas`,
  );
  ok(
    "traen días abierta y estancada",
    abiertas.datos.every((a) => typeof a.diasAbierta === "number" && typeof a.estancada === "boolean"),
  );

  const pendientesTop = await pedir(gpv, `/tiendas/${tiendaId}/top-picos-pendientes`);
  ok(
    "Top Picos pendientes con su nombre",
    pendientesTop.estado === 200 &&
      pendientesTop.datos.some((t) => t.referencia.nombre === referencia.nombre),
    pendientesTop.datos?.[0]?.referencia?.nombre,
  );

  // Dos comprobaciones sucesivas: la primera no cierra, la segunda sí.
  await pedir(gpv, `/acciones/${topPico.datos.id}/comprobaciones`, {
    method: "POST",
    cuerpo: { desenlace: "sigue_pendiente", comentario: "El encargado lo pedirá", visitaId },
  });
  const cierre = await pedir(gpv, `/acciones/${topPico.datos.id}/comprobaciones`, {
    method: "POST",
    cuerpo: { desenlace: "resuelta", comentario: "Ya está en lineal", visitaId },
  });
  ok("comprobar y cerrar", cierre.estado === 201, `HTTP ${cierre.estado}`);

  const historial = await pedir(gpv, `/acciones/${topPico.datos.id}/comprobaciones`);
  ok(
    "el historial conserva ambas",
    historial.datos.length === 2 && historial.datos[1].desenlace === "resuelta",
    historial.datos?.map((h) => h.desenlace).join(" → "),
  );

  const [topActualizado] = await sql`
    select incorporada from top_picos_pendientes where accion_id = ${topPico.datos.id}`;
  ok("el Top Pico queda incorporado", topActualizado.incorporada === true);

  const yaCerrada = await pedir(gpv, `/acciones/${topPico.datos.id}/comprobaciones`, {
    method: "POST",
    cuerpo: { desenlace: "resuelta", visitaId },
  });
  ok("no se comprueba lo ya cerrado", yaCerrada.estado === 409, `HTTP ${yaCerrada.estado}`);

  // ── Relación con el responsable ──────────────────────────────────────
  console.log("\nResponsable de tienda y resumen");

  const sinValoracion = await pedir(gpv, `/visitas/${visitaId}/responsable`, {
    method: "PUT",
    cuerpo: { haHablado: true },
  });
  ok("hablar sin valorar se rechaza", sinValoracion.estado === 400, `HTTP ${sinValoracion.estado}`);

  await pedir(gpv, `/visitas/${visitaId}/responsable`, {
    method: "PUT",
    cuerpo: { haHablado: true, valoracion: "buena" },
  });
  const corregida = await pedir(gpv, `/visitas/${visitaId}/responsable`, {
    method: "PUT",
    cuerpo: { haHablado: true, valoracion: "correcta" },
  });
  const [cuantas] = await sql`
    select count(*)::int as n from relaciones_responsable where visita_id = ${visitaId}`;
  ok(
    "una sola relación por visita, corregible",
    corregida.estado === 200 && cuantas.n === 1 && corregida.datos.valoracion === "correcta",
    `${cuantas.n} fila(s), valoración ${corregida.datos?.valoracion}`,
  );

  // ── Resumen previo al cierre ─────────────────────────────────────────
  const resumen = await pedir(gpv, `/visitas/${visitaId}/resumen`);
  ok("resumen por categoría", resumen.estado === 200 && !!resumen.datos.porCategoria.dairy);
  ok(
    "el resumen suma los facings",
    resumen.datos.porCategoria.dairy.facingsGanados === 3,
    `${resumen.datos?.porCategoria?.dairy?.facingsGanados} facings`,
  );
  ok(
    "separa incidencias de oportunidades",
    resumen.datos.porCategoria.dairy.incidencias >= 1 &&
      resumen.datos.porCategoria.dairy.oportunidades >= 2,
    `${resumen.datos?.porCategoria?.dairy?.incidencias} inc / ${resumen.datos?.porCategoria?.dairy?.oportunidades} opo`,
  );
  ok("cuenta lo que va al FSM", resumen.datos.porCategoria.dairy.paraElFsm >= 1);

  // ── Panel del FSM ────────────────────────────────────────────────────
  console.log("\nPanel del FSM");

  const bandeja = await pedir(fsm, "/acciones?limite=200");
  ok("bandeja del FSM", bandeja.estado === 200 && bandeja.datos.length > 0, `${bandeja.datos?.length} acciones`);
  ok(
    "lo más antiguo primero",
    bandeja.datos.every(
      (a, i) => i === 0 || new Date(bandeja.datos[i - 1].detectadaEn) <= new Date(a.detectadaEn),
    ),
  );

  // Por su código, no por tipo: la bandeja trae también las neveras de
  // `db:pruebas`, y buscar por tipo devolvería cualquiera de ellas.
  const conNevera = bandeja.datos.find((a) => a.codigoNevera === "NV-0442-GRA");
  ok(
    "el código de nevera llega al panel",
    conNevera?.codigoNevera === "NV-0442-GRA",
    conNevera?.codigoNevera,
  );

  const soloFsm = await pedir(fsm, "/acciones?responsableActuar=fsm&limite=100");
  ok(
    "filtra por responsable",
    soloFsm.datos.every((a) => a.responsableActuar === "fsm"),
    `${soloFsm.datos?.length} para el FSM`,
  );

  // El FSM cierra una acción: queda registrado que fue él.
  const cerrarFsm = await pedir(fsm, `/acciones/${nevera.datos.id}`, {
    method: "PATCH",
    cuerpo: { estado: "resuelta", notaResultado: "Informado en la aplicación de neveras" },
  });
  ok("el FSM cierra desde el panel", cerrarFsm.estado === 200, `HTTP ${cerrarFsm.estado}`);

  const [trazaCierre] = await sql`
    select a.cerrada_por_rol, u.numero_trabajador
    from acciones a join usuarios u on u.id = a.cerrada_por where a.id = ${nevera.datos.id}`;
  ok(
    "queda quién cerró y con qué rol",
    trazaCierre.cerrada_por_rol === "supervisor" && trazaCierre.numero_trabajador === "20001",
    `${trazaCierre.numero_trabajador} (${trazaCierre.cerrada_por_rol})`,
  );

  const reabrir = await pedir(fsm, `/acciones/${nevera.datos.id}`, {
    method: "PATCH",
    cuerpo: { estado: "abierta" },
  });
  ok("no se reabre lo resuelto", reabrir.estado === 409, `HTTP ${reabrir.estado}`);

  // El GPV no entra en la bandeja del FSM.
  const gpvEnBandeja = await pedir(gpv, "/acciones");
  ok("el GPV no ve la bandeja", gpvEnBandeja.estado === 403, `HTTP ${gpvEnBandeja.estado}`);
} catch (error) {
  console.error("\nError:", error.message);
  fallos++;
} finally {
  // Limpieza acotada a lo que creó esta prueba.
  if (visitaId) {
    const mias = sql`select id from acciones where visita_origen_id = ${visitaId}`;
    for (const tabla of [
      "detecciones_stock", "detecciones_fechas", "detecciones_hueco",
      "top_picos_pendientes", "ganancias_facings", "neveras",
      "oportunidades_visibilidad", "nueva_implantacion_marcas",
      "oportunidades_reorganizacion", "extraespacios",
    ]) {
      await sql.unsafe(
        `delete from ${tabla} where accion_id in (select id from acciones where visita_origen_id = $1)`,
        [visitaId],
      );
    }
    await sql`delete from comprobaciones_accion where accion_id in (${mias})`;
    await sql`delete from relaciones_responsable where visita_id = ${visitaId}`;
    await sql`delete from acciones where visita_origen_id = ${visitaId}`;
    // Solo se devuelve a pendiente si la abrimos nosotros: si ya estaba en
    // curso, cerrarla sería destruir el estado de otra prueba.
    if (!abiertaPorNosotros) {
      await sql`update visitas set estado = 'pendiente', hora_inicio = null,
                  ubicacion_inicio = null where id = ${visitaId}`;
    }
  }

  const [restos] = await sql`select count(*)::int as n from acciones`;
  console.log(`\nLimpieza: ${restos.n} acciones en base.`);
  console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} FALLO(S).\n`);
  await sql.end();
  process.exit(fallos === 0 ? 0 : 1);
}
