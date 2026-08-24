CREATE TYPE "public"."ambito_foto" AS ENUM('visita', 'checklist', 'incidencia');--> statement-breakpoint
CREATE TYPE "public"."estado_incidencia" AS ENUM('abierta', 'en_revision', 'resuelta', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."estado_revision" AS ENUM('pendiente', 'aceptada', 'cuestionada');--> statement-breakpoint
CREATE TYPE "public"."estado_visita" AS ENUM('pendiente', 'en_curso', 'finalizada', 'no_realizada');--> statement-breakpoint
CREATE TYPE "public"."idioma" AS ENUM('es', 'eu', 'ca', 'fr', 'en');--> statement-breakpoint
CREATE TYPE "public"."origen_tienda" AS ENUM('manual', 'csv', 'erp');--> statement-breakpoint
CREATE TYPE "public"."prioridad" AS ENUM('baja', 'media', 'alta', 'critica');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('comercial', 'supervisor', 'administrador');--> statement-breakpoint
CREATE TYPE "public"."tipo_categoria" AS ENUM('incidencia', 'oportunidad');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" jsonb NOT NULL,
	"codigo" text NOT NULL,
	"tipo" "tipo_categoria" NOT NULL,
	"prioridad_defecto" "prioridad" DEFAULT 'media' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivos_no_realizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"texto" jsonb NOT NULL,
	"codigo" text NOT NULL,
	"requiere_comentario" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motivos_no_realizacion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tipos_tienda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" jsonb NOT NULL,
	"codigo" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipos_tienda_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zonas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" jsonb NOT NULL,
	"codigo" text NOT NULL,
	"region" text,
	"zona_horaria" text DEFAULT 'Europe/Madrid' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zonas_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_trabajador" text NOT NULL,
	"nombre" text NOT NULL,
	"email" text,
	"rol" "rol" NOT NULL,
	"zona_id" uuid,
	"password_hash" text NOT NULL,
	"requiere_cambio_password" boolean DEFAULT false NOT NULL,
	"idioma_preferido" "idioma" DEFAULT 'es' NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"ultimo_acceso_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_numero_trabajador_unique" UNIQUE("numero_trabajador")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tiendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"numero_referencia" text NOT NULL,
	"direccion" text,
	"localidad" text,
	"codigo_postal" text,
	"ubicacion" jsonb,
	"zona_id" uuid,
	"tipo_tienda_id" uuid,
	"id_externo" text,
	"origen" "origen_tienda" DEFAULT 'manual' NOT NULL,
	"sincronizado_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "justificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"motivo_id" uuid NOT NULL,
	"comentario" text,
	"capturada_en" timestamp with time zone NOT NULL,
	"recibida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revisada_por" uuid,
	"estado_revision" "estado_revision" DEFAULT 'pendiente' NOT NULL,
	"revisada_en" timestamp with time zone,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "justificaciones_visita_id_unique" UNIQUE("visita_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rutas_diarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tienda_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"orden_sugerido" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tienda_id" uuid NOT NULL,
	"ruta_diaria_id" uuid,
	"fecha" date NOT NULL,
	"estado" "estado_visita" DEFAULT 'pendiente' NOT NULL,
	"planificada" boolean DEFAULT true NOT NULL,
	"hora_inicio" timestamp with time zone,
	"ubicacion_inicio" jsonb,
	"hora_fin" timestamp with time zone,
	"ubicacion_fin" jsonb,
	"incompleta" boolean DEFAULT false NOT NULL,
	"justificada" boolean DEFAULT false NOT NULL,
	"notas_libres" text,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plantilla_id" uuid NOT NULL,
	"texto" jsonb NOT NULL,
	"requiere_foto" boolean DEFAULT false NOT NULL,
	"obligatorio" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plantillas_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" jsonb NOT NULL,
	"tipo_tienda_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resultados_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"completado" boolean DEFAULT false NOT NULL,
	"completado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"ambito" "ambito_foto" NOT NULL,
	"resultado_checklist_id" uuid,
	"incidencia_id" uuid,
	"clave_almacenamiento" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"ancho_px" integer,
	"alto_px" integer,
	"capturada_en" timestamp with time zone NOT NULL,
	"ubicacion" jsonb,
	"expira_en" timestamp with time zone,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"descripcion" text,
	"prioridad" "prioridad" DEFAULT 'media' NOT NULL,
	"estado" "estado_incidencia" DEFAULT 'abierta' NOT NULL,
	"asignado_a" uuid,
	"resuelta_en" timestamp with time zone,
	"nota_resolucion" text,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"numero_trabajador" text,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"cambios" jsonb,
	"ip" text,
	"agente_usuario" text,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_zona_id_zonas_id_fk" FOREIGN KEY ("zona_id") REFERENCES "public"."zonas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tiendas" ADD CONSTRAINT "tiendas_zona_id_zonas_id_fk" FOREIGN KEY ("zona_id") REFERENCES "public"."zonas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tiendas" ADD CONSTRAINT "tiendas_tipo_tienda_id_tipos_tienda_id_fk" FOREIGN KEY ("tipo_tienda_id") REFERENCES "public"."tipos_tienda"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "justificaciones" ADD CONSTRAINT "justificaciones_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "justificaciones" ADD CONSTRAINT "justificaciones_motivo_id_motivos_no_realizacion_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos_no_realizacion"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "justificaciones" ADD CONSTRAINT "justificaciones_revisada_por_usuarios_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rutas_diarias" ADD CONSTRAINT "rutas_diarias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rutas_diarias" ADD CONSTRAINT "rutas_diarias_tienda_id_tiendas_id_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitas" ADD CONSTRAINT "visitas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitas" ADD CONSTRAINT "visitas_tienda_id_tiendas_id_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitas" ADD CONSTRAINT "visitas_ruta_diaria_id_rutas_diarias_id_fk" FOREIGN KEY ("ruta_diaria_id") REFERENCES "public"."rutas_diarias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items_checklist" ADD CONSTRAINT "items_checklist_plantilla_id_plantillas_checklist_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_checklist"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plantillas_checklist" ADD CONSTRAINT "plantillas_checklist_tipo_tienda_id_tipos_tienda_id_fk" FOREIGN KEY ("tipo_tienda_id") REFERENCES "public"."tipos_tienda"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resultados_checklist" ADD CONSTRAINT "resultados_checklist_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resultados_checklist" ADD CONSTRAINT "resultados_checklist_item_id_items_checklist_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items_checklist"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fotos" ADD CONSTRAINT "fotos_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fotos" ADD CONSTRAINT "fotos_resultado_checklist_id_resultados_checklist_id_fk" FOREIGN KEY ("resultado_checklist_id") REFERENCES "public"."resultados_checklist"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fotos" ADD CONSTRAINT "fotos_incidencia_id_incidencias_id_fk" FOREIGN KEY ("incidencia_id") REFERENCES "public"."incidencias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_asignado_a_usuarios_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categorias_codigo_unico" ON "categorias" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usuarios_zona_idx" ON "usuarios" USING btree ("zona_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usuarios_rol_idx" ON "usuarios" USING btree ("rol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tiendas_numero_referencia_idx" ON "tiendas" USING btree ("numero_referencia");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tiendas_id_externo_unico" ON "tiendas" USING btree ("id_externo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tiendas_zona_idx" ON "tiendas" USING btree ("zona_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tiendas_nombre_idx" ON "tiendas" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "justificaciones_id_cliente_unico" ON "justificaciones" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "justificaciones_estado_revision_idx" ON "justificaciones" USING btree ("estado_revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rutas_diarias_unica" ON "rutas_diarias" USING btree ("usuario_id","tienda_id","fecha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rutas_diarias_usuario_fecha_idx" ON "rutas_diarias" USING btree ("usuario_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visitas_id_cliente_unico" ON "visitas" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitas_usuario_fecha_idx" ON "visitas" USING btree ("usuario_id","fecha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitas_tienda_idx" ON "visitas" USING btree ("tienda_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitas_estado_fecha_idx" ON "visitas" USING btree ("estado","fecha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_checklist_plantilla_idx" ON "items_checklist" USING btree ("plantilla_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resultados_checklist_unico" ON "resultados_checklist" USING btree ("visita_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resultados_checklist_visita_idx" ON "resultados_checklist" USING btree ("visita_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fotos_id_cliente_unico" ON "fotos" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fotos_visita_idx" ON "fotos" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fotos_incidencia_idx" ON "fotos" USING btree ("incidencia_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fotos_expira_en_idx" ON "fotos" USING btree ("expira_en");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incidencias_id_cliente_unico" ON "incidencias" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidencias_visita_idx" ON "incidencias" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidencias_estado_prioridad_idx" ON "incidencias" USING btree ("estado","prioridad");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auditoria_usuario_idx" ON "auditoria" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auditoria_ocurrido_en_idx" ON "auditoria" USING btree ("ocurrido_en");