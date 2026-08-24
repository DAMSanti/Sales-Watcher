import { Module } from "@nestjs/common";
import { FotosController } from "./fotos.controller";
import { MantenimientoController } from "./mantenimiento.controller";
import { FotosService } from "./fotos.service";
import { PurgaFotosService } from "./purga-fotos.service";

@Module({
  controllers: [FotosController, MantenimientoController],
  providers: [FotosService, PurgaFotosService],
  exports: [FotosService, PurgaFotosService],
})
export class FotosModule {}
