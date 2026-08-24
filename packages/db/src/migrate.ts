import { migrate } from "drizzle-orm/postgres-js/migrator";
import { cargarEnv } from "./cargar-env";
import { crearCliente } from "./index";

cargarEnv();

/**
 * Envuelto en una función en lugar de usar `await` de nivel superior: los
 * paquetes compilan a CommonJS, que no lo admite.
 */
async function principal() {
  const { db, sql } = crearCliente();
  console.log("Aplicando migraciones...");
  await migrate(db, { migrationsFolder: `${__dirname}/../migrations` });
  console.log("Migraciones aplicadas.");
  await sql.end();
}

principal().catch((error) => {
  console.error("Fallo aplicando migraciones:", error);
  process.exit(1);
});
