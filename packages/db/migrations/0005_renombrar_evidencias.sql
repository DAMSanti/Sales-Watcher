-- Renombra `fotos` a `evidencias` y prepara la normalización de vídeo.
--
-- Escrita a mano en lugar de generada. `drizzle-kit` no puede saber si un
-- nombre nuevo es un renombrado o una tabla distinta, y ante la duda produce
-- un DROP seguido de un CREATE: eso perdería todas las evidencias existentes.
-- Un ALTER ... RENAME conserva los datos, los índices y las claves foráneas.

ALTER TYPE "ambito_foto" RENAME TO "ambito_evidencia";--> statement-breakpoint

ALTER TABLE "fotos" RENAME TO "evidencias";--> statement-breakpoint

-- Los índices no se renombran solos con la tabla: conservan su nombre viejo y
-- el siguiente `generate` los vería como sobrantes y los recrearía.
ALTER INDEX "fotos_id_cliente_unico" RENAME TO "evidencias_id_cliente_unico";--> statement-breakpoint
ALTER INDEX "fotos_visita_idx" RENAME TO "evidencias_visita_idx";--> statement-breakpoint
ALTER INDEX "fotos_incidencia_idx" RENAME TO "evidencias_incidencia_idx";--> statement-breakpoint
ALTER INDEX "fotos_expira_en_idx" RENAME TO "evidencias_expira_en_idx";--> statement-breakpoint
ALTER INDEX "fotos_confirmada_en_idx" RENAME TO "evidencias_confirmada_en_idx";--> statement-breakpoint

-- Normalización de vídeo (SPECS §8).
--
-- `normalizada_en` en null significa "sin normalizar", que en una fotografía es
-- lo normal y en un vídeo puede ser que aún no le haya tocado turno o que el
-- procesado fallara. Nunca significa que el fichero se haya perdido: el
-- original se conserva siempre.
ALTER TABLE "evidencias" ADD COLUMN "normalizada_en" timestamp with time zone;--> statement-breakpoint

-- Sin este contador, un vídeo que ffmpeg no puede procesar se reintentaría en
-- cada pasada para siempre.
ALTER TABLE "evidencias" ADD COLUMN "intentos_normalizacion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- La cola de normalización barre por aquí: vídeos confirmados sin normalizar.
CREATE INDEX IF NOT EXISTS "evidencias_normalizar_idx" ON "evidencias" USING btree ("tipo","normalizada_en");
