import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "@sw/db";
import type { Configuracion } from "../config/configuracion";

export const SERVICIO_DB = Symbol("SERVICIO_DB");
export const CONEXION_DB = Symbol("CONEXION_DB");

export type ClienteDb = ReturnType<typeof drizzle<typeof schema>>;
type Conexion = ReturnType<typeof postgres>;

/**
 * Acceso a base de datos, global para no repetir el import en cada módulo.
 *
 * La conexión se cierra en el apagado de la aplicación: sin eso, un reinicio
 * en caliente deja conexiones colgando y el pool del servidor se agota tras
 * unos cuantos despliegues.
 */
@Global()
@Module({
  providers: [
    {
      provide: CONEXION_DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuracion, true>) =>
        postgres(config.get("DATABASE_URL", { infer: true }), { max: 10 }),
    },
    {
      provide: SERVICIO_DB,
      inject: [CONEXION_DB],
      useFactory: (conexion: Conexion) => drizzle(conexion, { schema }),
    },
  ],
  exports: [SERVICIO_DB, CONEXION_DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(CONEXION_DB) private readonly conexion: Conexion) {}

  async onApplicationShutdown() {
    await this.conexion.end({ timeout: 5 });
  }
}
