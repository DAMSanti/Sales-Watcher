import { Module } from "@nestjs/common";
import { CatalogosController } from "./catalogos.controller";
import { CatalogosService } from "./catalogos.service";
import { ProductosController } from "./productos.controller";
import { ProductosService } from "./productos.service";

@Module({
  controllers: [CatalogosController, ProductosController],
  providers: [CatalogosService, ProductosService],
  exports: [CatalogosService],
})
export class CatalogosModule {}
