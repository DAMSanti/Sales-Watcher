import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** El `.env` compartido vive en la raíz del monorepo, no aquí. */
const RAIZ = resolve(__dirname, "../..");

/**
 * Backoffice.
 *
 * Sin service worker ni caché offline, a diferencia de la app de campo: se usa
 * desde un escritorio con conexión estable, y la especificación lo dice
 * explícitamente (SPECS §4). Añadir offline aquí sería complejidad sin caso de
 * uso, y una caché de informes mostraría cifras viejas al supervisor sin que
 * él lo supiera.
 */
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Los puertos salen del `.env` de la raíz del monorepo.
 *
 * Estaban cableados aquí, y cambiar uno obligaba a tocar varios ficheros y a
 * acordarse de todos. Ahora el bloque 3900-3907 vive en un solo sitio y una
 * colisión con otro proyecto se resuelve editando una línea.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, RAIZ, "");
  const api = `http://localhost:${env.PORT ?? "3900"}`;
  // `strictPort` a propósito: sin él, Vite salta al siguiente puerto libre
  // y acabas con dos servidores sirviendo código distinto sin enterarte.
  const proxy = { "/api": { target: api, changeOrigin: true } };

  return {
    plugins: [react()],
  optimizeDeps: { exclude: ["@sw/shared"] },
    server: { port: Number(env.PUERTO_BACKOFFICE ?? 3902), strictPort: true, proxy },
    preview: { port: Number(env.PUERTO_BACKOFFICE_PREVIEW ?? 3904), strictPort: true, proxy },
  };
});
