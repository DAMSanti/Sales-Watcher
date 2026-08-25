import { Module } from "@nestjs/common";
import { InformesController } from "./informes.controller";
import { ResultadosController } from "./resultados.controller";
import { InformesService } from "./informes.service";
import { ResultadosService } from "./resultados.service";

@Module({
  controllers: [InformesController, ResultadosController],
  providers: [InformesService, ResultadosService],
})
export class InformesModule {}
