import { Module } from "@nestjs/common";
import { AccionesModule } from "../acciones/acciones.module";
import { EvidenciasModule } from "../evidencias/evidencias.module";
import { IncidenciasModule } from "../incidencias/incidencias.module";
import { VisitasModule } from "../visitas/visitas.module";
import { SincronizacionController } from "./sincronizacion.controller";
import { SincronizacionService } from "./sincronizacion.service";

@Module({
  imports: [VisitasModule, IncidenciasModule, EvidenciasModule, AccionesModule],
  controllers: [SincronizacionController],
  providers: [SincronizacionService],
})
export class SincronizacionModule {}
