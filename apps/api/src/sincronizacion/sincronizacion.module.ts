import { Module } from "@nestjs/common";
import { AccionesModule } from "../acciones/acciones.module";
import { FotosModule } from "../fotos/fotos.module";
import { IncidenciasModule } from "../incidencias/incidencias.module";
import { VisitasModule } from "../visitas/visitas.module";
import { SincronizacionController } from "./sincronizacion.controller";
import { SincronizacionService } from "./sincronizacion.service";

@Module({
  imports: [VisitasModule, IncidenciasModule, FotosModule, AccionesModule],
  controllers: [SincronizacionController],
  providers: [SincronizacionService],
})
export class SincronizacionModule {}
