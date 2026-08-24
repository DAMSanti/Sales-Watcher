ALTER TABLE "fotos" ADD COLUMN "confirmada_en" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fotos_confirmada_en_idx" ON "fotos" USING btree ("confirmada_en");