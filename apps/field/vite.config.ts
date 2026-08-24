import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** El `.env` compartido vive en la raíz del monorepo, no aquí. */
const RAIZ = resolve(__dirname, "../..");

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
    plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      /**
       * El service worker también se activa en desarrollo.
       *
       * Sin esto, el comportamiento offline solo se puede probar tras un
       * `build`, y el fallo que aparece —pantalla en blanco al recargar sin
       * cobertura— es justo el que no se debe descubrir en producción.
       */
      devOptions: { enabled: true, type: "module" },

      manifest: {
        name: "Sales Watcher",
        short_name: "Sales Watcher",
        description: "Registro de visitas comerciales en punto de venta",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0057b8",
        theme_color: "#0057b8",
        icons: [
          { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icono-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],

        /**
         * Toda navegación cae en index.html desde la caché.
         *
         * Es lo que permite recargar la app sin cobertura: sin esta regla, un
         * refresco offline da pantalla en blanco porque el navegador no puede
         * pedir el documento.
         */
        navigateFallback: "index.html",
        /** Salvo las llamadas a la API, que tienen su propia estrategia. */
        navigateFallbackDenylist: [/^\/api\//],

        runtimeCaching: [
          {
            /**
             * Lecturas de la API: red primero, caché como red de seguridad.
             *
             * El comercial necesita datos frescos cuando hay cobertura —una
             * ruta cambiada por el supervisor esta mañana— y los últimos
             * conocidos cuando no la hay. `NetworkFirst` da exactamente eso.
             *
             * El tiempo de espera es corto: en una red móvil moribunda,
             * esperar treinta segundos a un `fetch` que no va a llegar es peor
             * experiencia que servir la caché de hace diez minutos.
             */
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/api/") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-lecturas",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],

        /**
         * Las escrituras NO se cachean ni se reintentan desde el service
         * worker: de eso se ocupa la cola en IndexedDB, que sabe distinguir un
         * fallo temporal de uno permanente. Background Sync duplicaría esa
         * lógica con menos información.
         */
      },
    }),
  ],

  /**
   * `@sw/shared` se consume como código fuente TypeScript, no desde su `dist`.
   *
   * Ese paquete compila a CommonJS para la API, y el pre-bundling de Vite lo
   * tomaría de ahí: los exports nombrados no se resuelven y la app arranca en
   * blanco con un "does not provide an export named". Excluyéndolo, Vite lo
   * transpila desde `src` igual que el resto de la aplicación.
   */
  optimizeDeps: { exclude: ["@sw/shared"] },

  /**
   * El mismo proxy en `preview`.
   *
   * Sin él, la build de producción servida en local no llega a la API y el
   * comportamiento offline no se puede probar donde de verdad importa: con el
   * service worker real, no con el de desarrollo.
   */
    preview: { port: Number(env.PUERTO_FIELD_PREVIEW ?? 3903), strictPort: true, proxy },

    /**
     * El proxy evita CORS en desarrollo y, sobre todo, hace que el cliente use
     * rutas relativas: en producción la app y la API pueden ir tras el mismo
     * dominio sin cambiar el código.
     */
    server: { port: Number(env.PUERTO_FIELD ?? 3901), strictPort: true, proxy },
  };
});
