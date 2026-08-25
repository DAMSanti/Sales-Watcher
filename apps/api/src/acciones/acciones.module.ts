import { Module } from "@nestjs/common";
import { AccionesController } from "./acciones.controller";
import { AccionesService } from "./acciones.service";

@Module({
  controllers: [AccionesController],
  providers: [AccionesService],
  exports: [AccionesService],
})
export class AccionesModule {}
