import { Module } from "@nestjs/common";
import { ChecklistsController } from "./checklists.controller";

@Module({ controllers: [ChecklistsController] })
export class ChecklistsModule {}
