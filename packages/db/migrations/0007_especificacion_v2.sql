-- Especificación funcional v2 del cliente (SPECS v0.7, ANEXO ronda 6).
--
-- Escrita a mano, como 0005 y 0006: los cambios de "nevera" y "nueva
-- implantación" no son renombrados que `drizzle-kit generate` pueda inferir
-- solo, y el proyecto está en fase de desarrollo sin datos de producción que
-- migrar (ANEXO, ronda 6) — se sustituye el modelo antiguo en vez de
-- transformarlo con cuidado.

-- ── Bloque de marca: nuevo tipo de situación, sin tabla de detalle ──────
ALTER TYPE "tipo_situacion" ADD VALUE IF NOT EXISTS 'bloque_marca';--> statement-breakpoint

-- ── Falta de producto: se retira la pregunta "¿se ha comunicado?" ──────
-- El cliente no la pidió en la v2, y la incidencia para el encargado más la
-- foto (ahora obligatoria en Waters/PBB) ya bastan para actuar.
ALTER TABLE "detecciones_stock" DROP COLUMN IF EXISTS "comunicado_al_responsable";--> statement-breakpoint

-- ── Hueco: pregunta única en Dairy ──────────────────────────────────────
-- `existe_hueco` pasa a incorporar el criterio de cobertura; ya no hace falta
-- una segunda columna para saber si el reponedor lo cubrió con una adyacente.
ALTER TABLE "detecciones_hueco" DROP COLUMN IF EXISTS "cubierto_con_adyacente";--> statement-breakpoint

-- ── Nueva implantación (antes "Reorganizar lineal") ─────────────────────
-- Deja de ser texto libre; se categoriza por marca, con "todo el lineal"
-- como alternativa. El nombre de la tabla y del tipo_situacion no cambian.
ALTER TABLE "oportunidades_reorganizacion" DROP COLUMN IF EXISTS "propuesta";--> statement-breakpoint
ALTER TABLE "oportunidades_reorganizacion" ADD COLUMN "todo_lineal" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "nueva_implantacion_marcas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"marca_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "nueva_implantacion_marcas" ADD CONSTRAINT "nueva_implantacion_marcas_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nueva_implantacion_marcas" ADD CONSTRAINT "nueva_implantacion_marcas_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nueva_implantacion_marcas_accion_idx" ON "nueva_implantacion_marcas" USING btree ("accion_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nueva_implantacion_marcas_unica" ON "nueva_implantacion_marcas" USING btree ("accion_id","marca_id");--> statement-breakpoint

-- ── Nevera: rediseño completo, exclusiva Dairy/Waters ───────────────────
-- Sustituye el árbol de ocho situaciones por uno binario: existe/no existe →
-- mantener/recoger → código + foto si se recoge; si no existe, oportunidad de
-- añadir. Deja de colgar de `extraespacios` (ya no comparte "motivo" con el
-- extraespacio genérico) y pasa a colgar directamente de `acciones`, como el
-- resto de flujos.
--
-- Sin datos de producción que preservar (proyecto en fase 1-2, ANEXO ronda 6):
-- se vacía la tabla en vez de intentar traducir las ocho situaciones antiguas
-- a las tres columnas nuevas.
TRUNCATE TABLE "neveras";--> statement-breakpoint

ALTER TABLE "neveras" DROP CONSTRAINT IF EXISTS "neveras_extraespacio_id_extraespacios_id_fk";--> statement-breakpoint
ALTER TABLE "neveras" DROP CONSTRAINT IF EXISTS "neveras_extraespacio_id_unique";--> statement-breakpoint
ALTER TABLE "neveras" DROP COLUMN IF EXISTS "extraespacio_id";--> statement-breakpoint
ALTER TABLE "neveras" DROP COLUMN IF EXISTS "situacion";--> statement-breakpoint

-- El enum antiguo (8 situaciones) se libera solo tras quitar la columna que
-- lo usaba; el nuevo (2 valores) se crea antes de usarlo en la columna.
DROP TYPE IF EXISTS "public"."situacion_nevera";--> statement-breakpoint
CREATE TYPE "public"."decision_nevera" AS ENUM('mantener', 'recoger');--> statement-breakpoint

ALTER TABLE "neveras" ADD COLUMN "accion_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "neveras" ADD CONSTRAINT "neveras_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neveras" ADD CONSTRAINT "neveras_accion_id_unique" UNIQUE("accion_id");--> statement-breakpoint
ALTER TABLE "neveras" ADD COLUMN "hay_nevera" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "neveras" ADD COLUMN "decision" "public"."decision_nevera";--> statement-breakpoint
ALTER TABLE "neveras" ADD COLUMN "oportunidad_anadir" boolean;
