import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as cargarDotenv } from "dotenv";

/**
 * Carga del `.env` de la raíz del monorepo.
 *
 * Va antes de cualquier import que lea `process.env`, porque `AppModule`
 * valida la configuración en el momento de importarse y fallaría con las
 * variables aún vacías.
 */
const rutaEnv = resolve(__dirname, "../../..", ".env");
if (existsSync(rutaEnv)) {
  cargarDotenv({ path: rutaEnv, quiet: true });
} else {
  // En producción las variables llegan del entorno, no de un fichero.
  const rutaAlternativa = resolve(process.cwd(), ".env");
  if (existsSync(rutaAlternativa)) {
    cargarDotenv({ path: rutaAlternativa, quiet: true });
  }
}

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { Configuracion } from "./config/configuracion";

async function arrancar() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Configuracion, true>);
  const logger = new Logger("Arranque");

  app.use(helmet());
  app.setGlobalPrefix("api");

  /**
   * Cierre ordenado: al recibir SIGTERM se dejan de aceptar peticiones nuevas
   * y se cierra la conexión de base de datos. Sin esto, cada despliegue deja
   * conexiones colgando hasta agotar el pool del servidor.
   */
  app.enableShutdownHooks();

  /**
   * La PWA y el backoffice se sirven desde orígenes distintos a la API, así
   * que CORS es obligatorio. En producción hay que fijar los orígenes
   * concretos: reflejar el origen que venga sirve en desarrollo, pero es
   * demasiado permisivo para una API con datos de geolocalización de
   * trabajadores.
   */
  const esProduccion = config.get("NODE_ENV", { infer: true }) === "production";
  app.enableCors({ origin: esProduccion ? [] : true, credentials: true });

  const puerto = config.get("PORT", { infer: true });
  await app.listen(puerto);

  logger.log(`API escuchando en http://localhost:${puerto}/api`);
  logger.log(`Entorno: ${config.get("NODE_ENV", { infer: true })}`);
}

arrancar().catch((error) => {
  console.error("No se pudo arrancar la API:", error);
  process.exit(1);
});
