import { Module } from "@nestjs/common";
import { AccionesController } from "./acciones.controller";
import { AccionesService } from "./acciones.service";
import { DetalleVisitaService } from "./detalle-visita.service";

@Module({
  controllers: [AccionesController],
  providers: [AccionesService, DetalleVisitaService],
  exports: [AccionesService, DetalleVisitaService],
})
export class AccionesModule {}
