/**
 * Verifica el estado de la base de datos tras cargar los datos semilla.
 *
 * Se ejecuta en CI después de correr el seed tres veces seguidas. Comprueba
 * dos cosas distintas:
 *
 *  1. IDEMPOTENCIA — que los conteos son exactamente los esperados. Un seed
 *     que duplica filas al reejecutarse es invisible si solo se ejecuta una
 *     vez, y así se coló el fallo de `zonas` durante el desarrollo: la tabla
 *     no tenía clave única, `onConflictDoNothing` nunca colisionaba, y cada
 *     ejecución añadía cinco filas más.
 *
 *  2. INTEGRIDAD DE TRADUCCIONES — que ningún contenido configurable sale sin
 *     los cinco idiomas. Sin esta comprobación, una traducción olvidada se
 *     descubre en producción, cuando un comercial ve un ítem de checklist en
 *     el idioma equivocado.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * En CI las variables llegan del entorno; en local están en el `.env` de la
 * raíz. Se carga solo si hace falta, para que el entorno siempre gane.
 */
if (!process.env.DATABASE_URL) {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rutaEnv = resolve(raiz, ".env");
  if (existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL. Copia .env.example a .env.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

/** Conteos esperados tras el seed, ejecutado las veces que sea. */
const CONTEOS = {
  // Solo Granada y Almería en esta versión inicial (ANEXO, cierra P29).
  zonas: 2,
  tipos_tienda: 5,
  categorias: 14,
  motivos_no_realizacion: 6,
  plantillas_checklist: 2,
  items_checklist: 16,
  usuarios: 9,
  tiendas: 12,
  // Catálogos del reencuadre. Placeholder hasta que llegue el real (P22, P32).
  marcas: 11,
  referencias_producto: 15,
};

/**
 * Tablas cuyo conteo es un MÍNIMO, no una igualdad.
 *
 * `db:pruebas` borra las rutas del seed y genera un mes de actividad en su
 * lugar. En CI no se ejecuta, así que el conteo es el del seed; en local, tras
 * generar datos de prueba, es mucho mayor. Exigir igualdad haría fallar la
 * verificación por un uso legítimo.
 */
const MINIMOS = {
  rutas_diarias: 12,
};

/** Tablas con contenido traducible, y la columna JSONB que lo contiene. */
const TRADUCIBLES = [
  ["categorias", "nombre"],
  ["motivos_no_realizacion", "texto"],
  ["items_checklist", "texto"],
  ["plantillas_checklist", "nombre"],
  ["tipos_tienda", "nombre"],
  ["zonas", "nombre"],
];

const IDIOMAS = ["es", "eu", "ca", "fr", "en"];

let fallos = 0;

function comprobar(descripcion, ok, detalle = "") {
  console.log(`  ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle}`);
  if (!ok) fallos++;
}

try {
  console.log("\nIdempotencia del seed");
  for (const [tabla, esperado] of Object.entries(CONTEOS)) {
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM ${sql(tabla)}`;
    comprobar(
      tabla.padEnd(24),
      total === esperado,
      ` ${total} (esperado ${esperado})`,
    );
  }

  for (const [tabla, minimo] of Object.entries(MINIMOS)) {
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM ${sql(tabla)}`;
    comprobar(tabla.padEnd(24), total >= minimo, ` ${total} (mínimo ${minimo})`);
  }

  console.log("\nTraducciones completas en los cinco idiomas");
  for (const [tabla, columna] of TRADUCIBLES) {
    const [{ incompletos }] = await sql`
      SELECT count(*)::int AS incompletos
      FROM ${sql(tabla)}
      WHERE NOT (${sql(columna)} ?& ${sql.array(IDIOMAS)})
    `;
    comprobar(
      `${tabla}.${columna}`.padEnd(24),
      incompletos === 0,
      ` ${incompletos} registro(s) sin traducir`,
    );
  }

  console.log("\nInvariantes del modelo");

  // El número de referencia no es clave primaria, pero sí debe ser único
  // entre tiendas activas: dos fichas activas con la misma referencia
  // significan un duplicado real en el catálogo.
  const [{ duplicadas }] = await sql`
    SELECT count(*)::int AS duplicadas FROM (
      SELECT numero_referencia FROM tiendas WHERE activo
      GROUP BY numero_referencia HAVING count(*) > 1
    ) d
  `;
  comprobar("referencias duplicadas".padEnd(24), duplicadas === 0, ` ${duplicadas}`);

  // Las fichas cargadas a mano no llevan id_externo: cuando llegue el ERP
  // habrá que poder distinguir lo sincronizado de lo introducido a mano.
  const [{ manualesConExterno }] = await sql`
    SELECT count(*)::int AS "manualesConExterno"
    FROM tiendas WHERE origen = 'manual' AND id_externo IS NOT NULL
  `;
  comprobar(
    "manuales sin id_externo".padEnd(24),
    manualesConExterno === 0,
    ` ${manualesConExterno} con id_externo`,
  );

  // Todas las contraseñas deben estar hasheadas con argon2id.
  const [{ sinArgon }] = await sql`
    SELECT count(*)::int AS "sinArgon"
    FROM usuarios WHERE password_hash NOT LIKE '$argon2id$%'
  `;
  comprobar("hashes argon2id".padEnd(24), sinArgon === 0, ` ${sinArgon} sin argon2id`);

  // ── El ciclo de acciones ─────────────────────────────────────────────
  //
  // Fijan decisiones de diseño fáciles de romper sin querer al tocar el esquema
  // más adelante. Todas comprueban forma, no datos: valen igual en CI.
  console.log("\nCiclo detección → acción → resultado");

  // "Estancada" se DERIVA de la antigüedad. Como columna permitiría que una
  // acción estuviera estancada y resuelta a la vez (SPECS §7.1).
  const columnaEstancada = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acciones' AND column_name = 'estancada'
  `;
  comprobar(
    "sin columna estancada".padEnd(24),
    columnaEstancada.length === 0,
    " es un valor derivado",
  );

  // La acción cuelga de la TIENDA, no de la visita. Con `tienda_id` nulable, el
  // seguimiento entre visitas se quedaría sin ancla.
  const [colTienda] = await sql`
    SELECT is_nullable AS "nulable" FROM information_schema.columns
    WHERE table_name = 'acciones' AND column_name = 'tienda_id'
  `;
  comprobar(
    "la acción es de la tienda".padEnd(24),
    colTienda?.nulable === "NO",
    " tienda_id NOT NULL",
  );

  // Marcas y referencias son nombres propios: `text`, nunca JSONB traducible.
  const nombresPropios = await sql`
    SELECT data_type AS "tipo" FROM information_schema.columns
    WHERE table_name IN ('marcas', 'referencias_producto') AND column_name = 'nombre'
  `;
  comprobar(
    "marcas sin traducir".padEnd(24),
    nombresPropios.length === 2 && nombresPropios.every((c) => c.tipo === "text"),
    " son nombres propios",
  );

  // Los códigos de tienda siguen el formato del cliente: el GPV los teclea.
  const [{ malos }] = await sql`
    SELECT count(*)::int AS "malos" FROM tiendas WHERE numero_referencia NOT LIKE '350%'
  `;
  comprobar("códigos con formato 350…".padEnd(24), malos === 0, ` ${malos} fuera de formato`);

  // El canal se guarda aunque no bifurque flujos: sin él no hay segmentación.
  const [{ sinCanal }] = await sql`
    SELECT count(*)::int AS "sinCanal" FROM tiendas WHERE canal IS NULL
  `;
  comprobar("todas las tiendas con canal".padEnd(24), sinCanal === 0, ` ${sinCanal} sin canal`);

  console.log(
    fallos === 0
      ? "\nVerificación superada.\n"
      : `\n${fallos} comprobación(es) fallida(s).\n`,
  );
} catch (error) {
  console.error("\nError verificando el seed:", error);
  fallos++;
} finally {
  await sql.end();
}

process.exit(fallos === 0 ? 0 : 1);
