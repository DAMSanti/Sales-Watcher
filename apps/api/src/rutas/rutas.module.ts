import { Module } from "@nestjs/common";
import { RutasController } from "./rutas.controller";

@Module({ controllers: [RutasController] })
export class RutasModule {}
