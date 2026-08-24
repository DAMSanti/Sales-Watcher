/**
 * Prueba del proceso de purga contra Postgres y MinIO reales.
 *
 * Verifica las dos limpiezas y, sobre todo, que el objeto desaparece del
 * almacenamiento y no solo la fila de base de datos.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DATABASE_URL && existsSync(resolve(raiz, ".env"))) {
  process.loadEnvFile(resolve(raiz, ".env"));
}

const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
const bucket = process.env.S3_BUCKET;

let fallos = 0;
const check = (d, ok, extra = "") => {
  console.log(`  ${ok ? "OK  " : "FALLA"}  ${d}${extra}`);
  if (!ok) fallos++;
};

async function existeObjeto(clave) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
    return true;
  } catch {
    return false;
  }
}

try {
  const [visita] = await sql`SELECT id, fecha FROM visitas LIMIT 1`;

  // ── Caso 1: foto confirmada y ya caducada ────────────────────────────
  const claveCaducada = `visitas/test/purga-caducada-${Date.now()}.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: claveCaducada,
      Body: Buffer.from("contenido de prueba"),
      ContentType: "image/png",
    }),
  );
  const [caducada] = await sql`
    INSERT INTO fotos (visita_id, ambito, clave_almacenamiento, tipo_mime,
                       tamano_bytes, capturada_en, confirmada_en, expira_en)
    VALUES (${visita.id}, 'visita', ${claveCaducada}, 'image/png', 19,
            now(), now(), now() - interval '1 day')
    RETURNING id`;

  // ── Caso 2: reserva abandonada, nunca confirmada ─────────────────────
  const claveAbandonada = `visitas/test/purga-abandonada-${Date.now()}.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: claveAbandonada,
      Body: Buffer.from("subida a medias"),
      ContentType: "image/png",
    }),
  );
  const [abandonada] = await sql`
    INSERT INTO fotos (visita_id, ambito, clave_almacenamiento, tipo_mime,
                       tamano_bytes, capturada_en, confirmada_en, creado_en)
    VALUES (${visita.id}, 'visita', ${claveAbandonada}, 'image/png', 15,
            now(), NULL, now() - interval '72 hours')
    RETURNING id`;

  // ── Caso 3: foto viva, no debe tocarse ───────────────────────────────
  const claveViva = `visitas/test/purga-viva-${Date.now()}.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: claveViva,
      Body: Buffer.from("no tocar"),
      ContentType: "image/png",
    }),
  );
  const [viva] = await sql`
    INSERT INTO fotos (visita_id, ambito, clave_almacenamiento, tipo_mime,
                       tamano_bytes, capturada_en, confirmada_en, expira_en)
    VALUES (${visita.id}, 'visita', ${claveViva}, 'image/png', 8,
            now(), now(), now() + interval '30 days')
    RETURNING id`;

  console.log("\nEstado antes de la purga");
  check("objeto caducado existe   ", await existeObjeto(claveCaducada));
  check("objeto abandonado existe ", await existeObjeto(claveAbandonada));
  check("objeto vivo existe       ", await existeObjeto(claveViva));

  // Disparar la purga a través del endpoint interno.
  const respuesta = await fetch("http://localhost:3000/api/mantenimiento/purga-fotos", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TOKEN_ADMIN}` },
  });
  const resultado = await respuesta.json();
  console.log(`\nResultado de la purga: ${JSON.stringify(resultado)}`);

  console.log("\nEstado después de la purga");
  check("objeto caducado BORRADO  ", !(await existeObjeto(claveCaducada)));
  check("objeto abandonado BORRADO", !(await existeObjeto(claveAbandonada)));
  check("objeto vivo INTACTO      ", await existeObjeto(claveViva));

  const filas = await sql`
    SELECT id FROM fotos WHERE id IN (${caducada.id}, ${abandonada.id}, ${viva.id})`;
  const ids = filas.map((f) => f.id);
  check("fila caducada borrada    ", !ids.includes(caducada.id));
  check("fila abandonada borrada  ", !ids.includes(abandonada.id));
  check("fila viva conservada     ", ids.includes(viva.id));

  // Limpieza
  await sql`DELETE FROM fotos WHERE id = ${viva.id}`;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: claveViva }));

  console.log(fallos === 0 ? "\nPurga verificada.\n" : `\n${fallos} fallo(s).\n`);
} catch (error) {
  console.error("\nError:", error.message);
  fallos++;
} finally {
  await sql.end();
}

process.exit(fallos === 0 ? 0 : 1);
