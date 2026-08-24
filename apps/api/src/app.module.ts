import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuditoriaModule } from "./auditoria/auditoria.module";
import { AuthModule } from "./auth/auth.module";
import { CambioPasswordGuard } from "./auth/guards/cambio-password.guard";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { cargarConfiguracion } from "./config/configuracion";
import { DbModule } from "./db/db.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => cargarConfiguracion()],
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    DbModule,
    AuditoriaModule,
    AuthModule,
  ],
  providers: [
    // El ORDEN importa: se ejecutan de arriba a abajo.
    // 1. Throttle antes que nada, para que un ataque no llegue ni a consultar
    //    la base de datos.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 2. Autenticación: valida el token contra base de datos y rellena
    //    `peticion.usuario`, del que dependen los dos siguientes.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 3. Cambio de contraseña pendiente: veta todo salvo el propio cambio.
    //    Va antes que roles porque es una restricción más general.
    { provide: APP_GUARD, useClass: CambioPasswordGuard },
    // 4. Rol: la comprobación más específica, la última.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
