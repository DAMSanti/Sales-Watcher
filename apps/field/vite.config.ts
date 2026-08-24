import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  /**
   * `@sw/shared` se consume como código fuente TypeScript, no desde su `dist`.
   *
   * Ese paquete compila a CommonJS para la API, y el pre-bundling de Vite lo
   * tomaría de ahí: los exports nombrados no se resuelven y la app arranca en
   * blanco con un "does not provide an export named". Excluyéndolo, Vite lo
   * transpila desde `src` igual que el resto de la aplicación.
   */
  optimizeDeps: { exclude: ["@sw/shared"] },
  server: {
    port: 5173,
    /**
     * La API se sirve en otro puerto. El proxy evita CORS en desarrollo y,
     * sobre todo, hace que el cliente use rutas relativas: en producción la
     * app y la API pueden ir tras el mismo dominio sin cambiar el código.
     */
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
