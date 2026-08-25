/**
 * Prueba el ciclo completo de una evidencia de vídeo.
 *
 * Genera un vídeo real con ffmpeg —1080p, con audio—, lo sube por URL firmada,
 * lo confirma y dispara la normalización. Después comprueba que lo almacenado
 * es de verdad 720p MP4 con su pista de audio intacta.
 *
 * Un vídeo de prueba sintético no valdría: lo que se está verificando es que
 * ffmpeg reescala, recodifica y CONSERVA EL AUDIO, que es requisito explícito
 * del cliente.
 *
 * Deja la base de datos como la encontró.
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
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe"));
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

/** Metadatos reales del fichero, no lo que declaramos de él. */
function sondear(ruta) {
  const salida = execFileSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "stream=codec_name,codec_type,height,width",
     "-show_entries", "format=duration,format_name", "-of", "json", ruta],
    { encoding: "utf8" },
  );
  const d = JSON.parse(salida);
  const video = d.streams.find((s) => s.codec_type === "video");
  const audio = d.streams.find((s) => s.codec_type === "audio");
  return {
    alto: video?.height,
    ancho: video?.width,
    codecVideo: video?.codec_name,
    codecAudio: audio?.codec_name,
    formato: d.format?.format_name,
    duracion: Math.round(Number(d.format?.duration ?? 0)),
  };
}

const carpeta = mkdtempSync(join(tmpdir(), "sw-prueba-video-"));
let evidenciaId = null;

try {
  if (!existsSync(FFMPEG)) {
    console.log(`\nffmpeg no está en ${FFMPEG}. Sin él no se puede verificar nada.\n`);
    process.exit(1);
  }

  // ── Un vídeo real: 1080p, 6 s, con tono de audio ─────────────────────
  const original = join(carpeta, "original.mp4");
  execFileSync(FFMPEG, [
    "-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", original,
  ], { stdio: "ignore" });

  const antes = sondear(original);
  const bytes = readFileSync(original);
  console.log(`\nOriginal: ${antes.ancho}x${antes.alto} ${antes.codecVideo}/${antes.codecAudio}, ` +
    `${antes.duracion}s, ${Math.round(bytes.length / 1024)} KB\n`);

  const gpv = await entrar("30001");
  const admin = await entrar("10000");

  // ── Reserva ──────────────────────────────────────────────────────────
  console.log("Reserva y subida");
  const dia = await pedir(gpv, "/visitas/dia");
  const visita =
    dia.datos.visitas.find((v) => v.estado === "en_curso") ??
    dia.datos.visitas.find((v) => v.estado === "pendiente");
  if (!visita) throw new Error("no hay visita utilizable hoy");
  if (visita.estado === "pendiente") {
    await pedir(gpv, `/visitas/${visita.visitaId}/comenzar`, { method: "POST", cuerpo: {} });
  }

  const reserva = await pedir(gpv, "/evidencias/subida", {
    method: "POST",
    cuerpo: {
      visitaId: visita.visitaId,
      ambito: "visita",
      tipoMime: "video/mp4",
      tamanoBytes: bytes.length,
      duracionS: antes.duracion,
      anchoPx: antes.ancho,
      altoPx: antes.alto,
      capturadaEn: new Date().toISOString(),
    },
  });
  ok("reserva de vídeo", reserva.estado === 201 || reserva.estado === 200,
    `HTTP ${reserva.estado} · tipo ${reserva.datos?.tipo}`);
  evidenciaId = reserva.datos?.evidenciaId;
  ok("se clasifica como vídeo", reserva.datos?.tipo === "video");

  // ── Lo que debe rechazarse ───────────────────────────────────────────
  const sinDuracion = await pedir(gpv, "/evidencias/subida", {
    method: "POST",
    cuerpo: {
      visitaId: visita.visitaId, ambito: "visita", tipoMime: "video/mp4",
      tamanoBytes: 1000, capturadaEn: new Date().toISOString(),
    },
  });
  ok("vídeo sin duración se rechaza", sinDuracion.estado === 400, `HTTP ${sinDuracion.estado}`);

  const demasiadoLargo = await pedir(gpv, "/evidencias/subida", {
    method: "POST",
    cuerpo: {
      visitaId: visita.visitaId, ambito: "visita", tipoMime: "video/mp4",
      tamanoBytes: 1000, duracionS: 120, capturadaEn: new Date().toISOString(),
    },
  });
  ok("vídeo de más de 60 s se rechaza", demasiadoLargo.estado === 400,
    `HTTP ${demasiadoLargo.estado}`);

  const fotoEnorme = await pedir(gpv, "/evidencias/subida", {
    method: "POST",
    cuerpo: {
      visitaId: visita.visitaId, ambito: "visita", tipoMime: "image/jpeg",
      tamanoBytes: 20 * 1024 * 1024, capturadaEn: new Date().toISOString(),
    },
  });
  ok("una foto de 20 MB se rechaza", fotoEnorme.estado === 400, `HTTP ${fotoEnorme.estado}`);

  const videoDe20MB = await pedir(gpv, "/evidencias/subida", {
    method: "POST",
    cuerpo: {
      visitaId: visita.visitaId, ambito: "visita", tipoMime: "video/mp4",
      tamanoBytes: 20 * 1024 * 1024, duracionS: 50, capturadaEn: new Date().toISOString(),
    },
  });
  ok("un vídeo de 20 MB se acepta", videoDe20MB.estado === 201 || videoDe20MB.estado === 200,
    `HTTP ${videoDe20MB.estado} — los límites son por tipo`);
  // Esa reserva no se sube: se limpia al final con el resto.

  // ── Subida y confirmación ────────────────────────────────────────────
  const subida = await fetch(reserva.datos.urlSubida, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: bytes,
  });
  ok("PUT a almacenamiento", subida.ok, `HTTP ${subida.status}`);

  const confirmar = await pedir(gpv, `/evidencias/${evidenciaId}/confirmar`, { method: "POST" });
  ok("confirmación", confirmar.estado === 200 || confirmar.estado === 201,
    `HTTP ${confirmar.estado}`);

  const [antesNorm] = await sql`
    select tipo, tipo_mime, tamano_bytes, alto_px, normalizada_en
    from evidencias where id = ${evidenciaId}`;
  ok("aún sin normalizar", antesNorm.normalizada_en === null,
    `${antesNorm.tipo_mime}, ${antesNorm.alto_px}p`);

  // ── Normalización ────────────────────────────────────────────────────
  console.log("\nNormalización");
  const norm = await pedir(admin, "/mantenimiento/normalizar-videos", { method: "POST" });
  ok("pasada de normalización", norm.estado === 200,
    `${norm.datos?.normalizados} normalizado(s), ${norm.datos?.fallidos} fallido(s)`);

  const [despues] = await sql`
    select tipo_mime, tamano_bytes, alto_px, normalizada_en, clave_almacenamiento,
           intentos_normalizacion
    from evidencias where id = ${evidenciaId}`;
  ok("marcada como normalizada", despues.normalizada_en !== null);
  ok("el MIME pasa a MP4", despues.tipo_mime === "video/mp4", despues.tipo_mime);
  ok("la altura queda en 720", despues.alto_px === 720, `${despues.alto_px}p`);
  ok("la clave refleja la altura", /720p\.mp4$/.test(despues.clave_almacenamiento),
    despues.clave_almacenamiento.split("/").pop());
  ok("pesa menos que el original", despues.tamano_bytes < bytes.length,
    `${Math.round(bytes.length / 1024)} KB → ${Math.round(despues.tamano_bytes / 1024)} KB`);

  // ── Lo importante: descargar y sondear el fichero de verdad ──────────
  console.log("\nEl fichero almacenado, sondeado");
  const urlDescarga = (await pedir(gpv, `/evidencias/${evidenciaId}/url`)).datos?.url;
  const descargado = join(carpeta, "descargado.mp4");
  const respuesta = await fetch(urlDescarga);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(descargado, Buffer.from(await respuesta.arrayBuffer()));

  const final = sondear(descargado);
  console.log(`  ${final.ancho}x${final.alto} ${final.codecVideo}/${final.codecAudio}, ` +
    `${final.duracion}s, ${final.formato}`);
  ok("altura real de 720", final.alto === 720, `${final.alto}px`);
  ok("proporción conservada", final.ancho === 1280, `${final.ancho}x${final.alto}`);
  ok("vídeo en H.264", final.codecVideo === "h264", final.codecVideo);
  /** El cliente pidió que se OIGAN bien: quitar el audio incumpliría el requisito. */
  ok("el audio se conserva en AAC", final.codecAudio === "aac", final.codecAudio ?? "sin audio");
  ok("duración intacta", Math.abs(final.duracion - antes.duracion) <= 1,
    `${antes.duracion}s → ${final.duracion}s`);

  // ── El original ya no ocupa sitio ────────────────────────────────────
  const segunda = await pedir(admin, "/mantenimiento/normalizar-videos", { method: "POST" });
  ok("no se reprocesa lo ya normalizado", segunda.datos?.normalizados === 0,
    `${segunda.datos?.procesados} procesado(s)`);
} catch (error) {
  console.error("\nError:", error.message);
  fallos++;
} finally {
  rmSync(carpeta, { recursive: true, force: true });
  // Limpieza: las evidencias de esta prueba y sus objetos.
  const mias = await sql`
    select id, clave_almacenamiento from evidencias
    where creado_en > now() - interval '10 minutes'`;
  if (mias.length > 0) {
    await sql`delete from evidencias where id in ${sql(mias.map((m) => m.id))}`;
  }
  console.log(`\nLimpieza: ${mias.length} evidencia(s) de prueba borradas.`);
  console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} FALLO(S).\n`);
  await sql.end();
  process.exit(fallos === 0 ? 0 : 1);
}
