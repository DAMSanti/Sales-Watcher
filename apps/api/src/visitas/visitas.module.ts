import { Module } from "@nestjs/common";
import { ChecklistService } from "./checklist.service";
import { CierreJornadaService } from "./cierre-jornada.service";
import { JustificacionesService } from "./justificaciones.service";
import { VisitasController } from "./visitas.controller";
import { VisitasService } from "./visitas.service";

@Module({
  controllers: [VisitasController],
  providers: [
    VisitasService,
    JustificacionesService,
    ChecklistService,
    CierreJornadaService,
  ],
  exports: [VisitasService, CierreJornadaService],
})
export class VisitasModule {}
