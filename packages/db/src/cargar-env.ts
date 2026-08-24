import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Carga el `.env` de la raíz del monorepo.
 *
 * Hay un único `.env` compartido en la raíz, no uno por paquete: las mismas
 * credenciales de base de datos y almacenamiento las necesitan la API, las
 * migraciones y el seed, y duplicarlas garantizaría que se desincronicen.
 *
 * La ruta se resuelve desde la ubicación de este módulo y no desde `cwd`
 * porque los scripts se ejecutan indistintamente desde la raíz (vía turbo) o
 * desde `packages/db` (vía pnpm --filter).
 */
export function cargarEnv(): void {
  const raiz = resolve(__dirname, "../../..");
  const ruta = resolve(raiz, ".env");

  if (!existsSync(ruta)) {
    console.warn(
      `Aviso: no se encontró ${ruta}. Copia .env.example a .env si algo falla.`,
    );
    return;
  }

  config({ path: ruta, quiet: true });
}
