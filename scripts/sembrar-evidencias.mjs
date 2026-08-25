/**
 * Siembra evidencias de muestra sobre acciones ya registradas.
 *
 * El seed crea visitas y acciones pero ninguna foto ni vídeo, así que el
 * detalle de visita del backoffice se veía siempre sin la mitad que más
 * importa: lo que el GPV fotografió. Sin material real no se puede comprobar
 * que la galería carga, que el reproductor reproduce ni que el aviso de
 * "sin normalizar" aparece cuando toca.
 *
 * Recorre el camino entero de la app —abrir la visita, registrar la situación,
 * reservar, PUT a la URL firmada, confirmar y cerrar la visita— en lugar de
 * insertar filas a mano. El primer intento adjuntaba sobre una visita ya
 * finalizada y la API lo rechazó con un 403 correcto: una visita cerrada no
 * admite evidencias nuevas. Ese rechazo es la razón de hacerlo así.
 *
 * A diferencia de `probar-video.mjs`, esto NO limpia: el material se queda
 * para poder mirarlo. Es idempotente por marca en `id_cliente`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DATABASE_URL) {
  const rutaEnv = resolve(raiz, ".env");
  if (existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);
}

const BASE = `http://localhost:${process.env.PORT ?? 3900}/api`;
const FFMPEG = process.env.FFMPEG_BIN ?? "ffmpeg";
const MARCA = "muestra-evidencia-";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

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
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const texto = await r.text();
  try {
    return { estado: r.status, datos: texto ? JSON.parse(texto) : null };
  } catch {
    return { estado: r.status, datos: texto };
  }
};

const carpeta = mkdtempSync(join(tmpdir(), "sw-muestras-"));

try {
  const yaHay = await sql`select count(*)::int as n from evidencias where id_cliente like ${MARCA + "%"}`;
  if (yaHay[0].n > 0) {
    console.log(`Ya hay ${yaHay[0].n} evidencias de muestra. Nada que hacer.`);
    process.exit(0);
  }

  /**
   * Hace falta una visita ABIERTA: la API rechaza evidencias sobre visitas
   * cerradas, y con razón. Se toma una pendiente de la ruta de hoy.
   */
  const [gpvFila] = await sql`
    select u.numero_trabajador as gpv
    from rutas_diarias r
    join usuarios u on u.id = r.usuario_id
    join visitas v on v.ruta_diaria_id = r.id
    where r.fecha = current_date and v.estado in ('pendiente', 'en_curso')
    order by u.numero_trabajador
    limit 1`;
  if (!gpvFila) throw new Error("no hay visitas abiertas ni pendientes hoy");

  const token = await entrar(gpvFila.gpv);
  const dia = await pedir(token, "/visitas/dia");
  const visitaDia =
    dia.datos.visitas.find((v) => v.estado === "en_curso") ??
    dia.datos.visitas.find((v) => v.estado === "pendiente");
  if (!visitaDia) throw new Error("la ruta de hoy no tiene visita utilizable");

  const visita = visitaDia.visitaId;
  if (visitaDia.estado === "pendiente") {
    await pedir(token, `/visitas/${visita}/comenzar`, { method: "POST", cuerpo: {} });
  }
  console.log(`Visita ${visita} en ${visitaDia.tienda.nombre} (GPV ${gpvFila.gpv})
`);

  /**
   * Dos situaciones de categorías distintas, para que el detalle del
   * backoffice tenga que agrupar de verdad y no solo pintar una lista.
   */
  const registrar = async (cuerpo) => {
    const r = await pedir(token, `/visitas/${visita}/acciones`, { method: "POST", cuerpo });
    if (r.estado !== 201) throw new Error(`registro: HTTP ${r.estado} ${JSON.stringify(r.datos)}`);
    return r.datos.id ?? r.datos.accionId;
  };

  const acciones = [
    await registrar({
      tipoSituacion: "stock",
      categoriaProducto: "dairy",
      suficiencia: "reponedor_no_ha_pasado",
    }),
    await registrar({
      tipoSituacion: "nevera",
      categoriaProducto: "waters",
      motivo: "potencial_venta",
      situacion: "necesita_recogida",
      codigoNevera: "NV-0117-GRA",
    }),
  ];

  /** Una foto JPEG real, no bytes inventados: el navegador tiene que pintarla. */
  const foto = join(carpeta, "muestra.jpg");
  execFileSync(FFMPEG, ["-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:duration=1:rate=1",
    "-frames:v", "1", foto], { stdio: "ignore" });

  const video = join(carpeta, "muestra.mp4");
  execFileSync(FFMPEG, ["-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=25:duration=8",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", video], { stdio: "ignore" });

  const piezas = [
    { fichero: foto, mime: "image/jpeg", accion: acciones[0], duracion: null },
    { fichero: video, mime: "video/mp4", accion: acciones[1], duracion: 8 },
  ];

  for (const [i, p] of piezas.entries()) {
    const bytes = readFileSync(p.fichero);
    const reserva = await pedir(token, "/evidencias/subida", {
      method: "POST",
      cuerpo: {
        visitaId: visita,
        ambito: "accion",
        accionId: p.accion,
        tipoMime: p.mime,
        tamanoBytes: bytes.length,
        anchoPx: 1280,
        altoPx: 720,
        ...(p.duracion ? { duracionS: p.duracion } : {}),
        idCliente: `${MARCA}${i}`,
        capturadaEn: new Date().toISOString(),
      },
    });
    if (!reserva.datos?.urlSubida) {
      throw new Error(`reserva ${p.mime}: HTTP ${reserva.estado} ${JSON.stringify(reserva.datos)}`);
    }

    const subida = await fetch(reserva.datos.urlSubida, {
      method: "PUT",
      headers: { "Content-Type": p.mime },
      body: bytes,
    });
    if (!subida.ok) throw new Error(`PUT ${p.mime}: HTTP ${subida.status}`);

    const conf = await pedir(token, `/evidencias/${reserva.datos.evidenciaId}/confirmar`, {
      method: "POST",
    });
    console.log(`  ${p.mime.padEnd(11)} ${Math.round(bytes.length / 1024)} KB · ` +
      `reserva ${reserva.estado} · confirmar ${conf.estado} · acción ${p.accion.slice(0, 8)}`);
  }

  /** Se cierra: el backoffice mira visitas terminadas, no visitas a medias. */
  const fin = await pedir(token, `/visitas/${visita}/finalizar`, { method: "POST", cuerpo: {} });
  console.log(`
  cierre de la visita · HTTP ${fin.estado}`);

  console.log(`\nListo. Visita para mirar en el backoffice:\n  /visitas/${visita}\n`);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
  await sql.end();
}
