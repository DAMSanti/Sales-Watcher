import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export * from "./schema/index";
export { schema };

/**
 * Cliente de base de datos.
 *
 * La conexión se configura solo con DATABASE_URL, sin nada específico de
 * proveedor: el hosting está deliberadamente sin decidir (ROADMAP fase 0) y
 * cambiarlo no debe tocar el código.
 */
export function crearCliente(url: string = process.env.DATABASE_URL ?? "") {
  if (!url) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env.");
  }
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
}

export type BaseDatos = ReturnType<typeof crearCliente>["db"];
