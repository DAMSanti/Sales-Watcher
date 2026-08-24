CREATE TABLE IF NOT EXISTS "operaciones_sincronizadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"op_id" text NOT NULL,
	"tipo" text NOT NULL,
	"resultado" jsonb,
	"aplicada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "operaciones_sincronizadas" ADD CONSTRAINT "operaciones_sincronizadas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operaciones_sincronizadas_unica" ON "operaciones_sincronizadas" USING btree ("usuario_id","op_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operaciones_sincronizadas_fecha_idx" ON "operaciones_sincronizadas" USING btree ("aplicada_en");