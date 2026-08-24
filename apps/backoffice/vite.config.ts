import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Backoffice.
 *
 * Sin service worker ni caché offline, a diferencia de la app de campo: se usa
 * desde un escritorio con conexión estable, y la especificación lo dice
 * explícitamente (SPECS §4). Añadir offline aquí sería complejidad sin caso de
 * uso, y una caché de informes mostraría cifras viejas al supervisor sin que
 * él lo supiera.
 */
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["@sw/shared"] },
  server: {
    port: 5174,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  preview: {
    port: 4174,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
});
