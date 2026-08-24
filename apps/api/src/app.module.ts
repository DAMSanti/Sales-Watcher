import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AlmacenamientoModule } from "./almacenamiento/almacenamiento.module";
import { AuditoriaModule } from "./auditoria/auditoria.module";
import { AuthModule } from "./auth/auth.module";
import { CambioPasswordGuard } from "./auth/guards/cambio-password.guard";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { cargarConfiguracion } from "./config/configuracion";
import { DbModule } from "./db/db.module";
import { FotosModule } from "./fotos/fotos.module";
import { IncidenciasModule } from "./incidencias/incidencias.module";
import { CatalogosModule } from "./catalogos/catalogos.module";
import { ChecklistsModule } from "./checklists/checklists.module";
import { RutasModule } from "./rutas/rutas.module";
import { SincronizacionModule } from "./sincronizacion/sincronizacion.module";
import { TiendasModule } from "./tiendas/tiendas.module";
import { UsuariosModule } from "./usuarios/usuarios.module";
import { VisitasModule } from "./visitas/visitas.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => cargarConfiguracion()],
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    // Habilita los procesos programados: purga de fotos y, más adelante,
    // el cierre de jornada.
    ScheduleModule.forRoot(),
    DbModule,
    AuditoriaModule,
    AlmacenamientoModule,
    AuthModule,
    FotosModule,
    VisitasModule,
    IncidenciasModule,
    SincronizacionModule,
    // Backoffice
    CatalogosModule,
    TiendasModule,
    UsuariosModule,
    ChecklistsModule,
    RutasModule,
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
