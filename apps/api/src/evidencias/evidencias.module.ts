import { Module } from "@nestjs/common";
import { VisitasModule } from "../visitas/visitas.module";
import { EvidenciasController } from "./evidencias.controller";
import { MantenimientoController } from "./mantenimiento.controller";
import { EvidenciasService } from "./evidencias.service";
import { NormalizacionVideoService } from "./normalizacion-video.service";
import { PurgaEvidenciasService } from "./purga-evidencias.service";

@Module({
  imports: [VisitasModule],
  controllers: [EvidenciasController, MantenimientoController],
  providers: [EvidenciasService, PurgaEvidenciasService, NormalizacionVideoService],
  exports: [EvidenciasService, PurgaEvidenciasService, NormalizacionVideoService],
})
export class EvidenciasModule {}
