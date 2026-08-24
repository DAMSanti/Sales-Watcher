import { Module } from "@nestjs/common";
import { VisitasModule } from "../visitas/visitas.module";
import { FotosController } from "./fotos.controller";
import { MantenimientoController } from "./mantenimiento.controller";
import { FotosService } from "./fotos.service";
import { PurgaFotosService } from "./purga-fotos.service";

@Module({
  imports: [VisitasModule],
  controllers: [FotosController, MantenimientoController],
  providers: [FotosService, PurgaFotosService],
  exports: [FotosService, PurgaFotosService],
})
export class FotosModule {}
