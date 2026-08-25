-- Las evidencias pueden colgar de una acción.
--
-- Los flujos de visibilidad, reorganización y nevera admiten fotografía
-- (SPECS §5.5), y el código de nevera pide además una del propio código. Sin
-- esto la foto quedaría con ámbito "visita" y nadie podría encontrarla desde
-- la acción que documenta.

ALTER TYPE "ambito_evidencia" ADD VALUE IF NOT EXISTS 'accion';--> statement-breakpoint

ALTER TABLE "evidencias" ADD COLUMN "accion_id" uuid REFERENCES "acciones"("id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "evidencias_accion_idx" ON "evidencias" USING btree ("accion_id");
