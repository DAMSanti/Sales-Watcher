CREATE TYPE "public"."canal" AS ENUM('modern', 'proximity');--> statement-breakpoint
CREATE TYPE "public"."categoria_producto" AS ENUM('dairy', 'waters', 'pbb', 'transversal');--> statement-breakpoint
CREATE TYPE "public"."correccion_hueco" AS ENUM('si', 'no_posible');--> statement-breakpoint
CREATE TYPE "public"."desenlace_comprobacion" AS ENUM('sigue_pendiente', 'resuelta', 'no_procede');--> statement-breakpoint
CREATE TYPE "public"."estado_accion" AS ENUM('abierta', 'en_curso', 'resuelta', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."motivo_extraespacio" AS ENUM('alta_rotacion', 'promocion', 'potencial_venta', 'falta_espacio_lineal', 'oportunidad_estacional', 'otro');--> statement-breakpoint
CREATE TYPE "public"."problema_fechas" AS ENUM('fifo_incorrecto', 'proximo_caducar', 'mal_colocado', 'otro');--> statement-breakpoint
CREATE TYPE "public"."propuesta_visibilidad" AS ENUM('subir_producto', 'bajar_producto', 'ganar_espacio', 'cambiar_ubicacion', 'reorganizar_lineal', 'otra');--> statement-breakpoint
CREATE TYPE "public"."responsable_actuar" AS ENUM('gpv', 'fsm');--> statement-breakpoint
CREATE TYPE "public"."situacion_nevera" AS ENUM('uso_correcto', 'uso_parcial', 'uso_incorrecto', 'retirada', 'vacia_desaprovechada', 'necesita_nueva', 'necesita_recogida', 'otro');--> statement-breakpoint
CREATE TYPE "public"."suficiencia_stock" AS ENUM('si', 'no', 'reponedor_no_ha_pasado');--> statement-breakpoint
CREATE TYPE "public"."tipo_evidencia" AS ENUM('foto', 'video');--> statement-breakpoint
CREATE TYPE "public"."tipo_extraespacio" AS ENUM('cabecera', 'isla', 'pila', 'nevera', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_situacion" AS ENUM('stock', 'fechas', 'hueco', 'top_pico', 'facings', 'visibilidad', 'reorganizacion', 'extraespacio', 'nevera', 'relacion_responsable');--> statement-breakpoint
CREATE TYPE "public"."ubicacion_lineal" AS ENUM('palomar', 'zona_intermedia', 'altura_ojos', 'foso', 'otra');--> statement-breakpoint
CREATE TYPE "public"."valoracion_relacion" AS ENUM('muy_buena', 'buena', 'correcta', 'mejorable', 'mala', 'no_ha_podido_hablar');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marcas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"codigo" text NOT NULL,
	"categoria_producto" "categoria_producto" NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referencias_producto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"codigo" text NOT NULL,
	"marca_id" uuid,
	"categoria_producto" "categoria_producto" NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tienda_id" uuid NOT NULL,
	"visita_origen_id" uuid NOT NULL,
	"categoria_producto" "categoria_producto" NOT NULL,
	"tipo_situacion" "tipo_situacion" NOT NULL,
	"responsable_actuar" "responsable_actuar" NOT NULL,
	"estado" "estado_accion" DEFAULT 'abierta' NOT NULL,
	"prioridad" "prioridad" DEFAULT 'media' NOT NULL,
	"detectada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_en" timestamp with time zone,
	"cerrada_por" uuid,
	"cerrada_por_rol" "rol",
	"nota_resultado" text,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comprobaciones_accion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"visita_id" uuid,
	"usuario_id" uuid NOT NULL,
	"desenlace" "desenlace_comprobacion" NOT NULL,
	"comentario" text,
	"comprobada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detecciones_fechas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"problema" "problema_fechas" NOT NULL,
	"detalle" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detecciones_fechas_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detecciones_hueco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"existe_hueco" boolean NOT NULL,
	"cubierto_con_adyacente" boolean,
	"correccion" "correccion_hueco",
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detecciones_hueco_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detecciones_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"suficiencia" "suficiencia_stock" NOT NULL,
	"comunicado_al_responsable" boolean,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detecciones_stock_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extraespacios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"tipo" "tipo_extraespacio" NOT NULL,
	"motivo" "motivo_extraespacio" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraespacios_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ganancias_facings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"marca_id" uuid,
	"conseguido" boolean DEFAULT false NOT NULL,
	"facings_ganados" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ganancias_facings_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "neveras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraespacio_id" uuid NOT NULL,
	"situacion" "situacion_nevera" NOT NULL,
	"codigo_nevera" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "neveras_extraespacio_id_unique" UNIQUE("extraespacio_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oportunidades_reorganizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"propuesta" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oportunidades_reorganizacion_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oportunidades_visibilidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"marca_id" uuid,
	"ubicacion_actual" "ubicacion_lineal" NOT NULL,
	"propuesta" "propuesta_visibilidad" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oportunidades_visibilidad_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relaciones_responsable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"ha_hablado" boolean NOT NULL,
	"valoracion" "valoracion_relacion",
	"cuestion_pendiente" boolean DEFAULT false NOT NULL,
	"comentario" text,
	"id_cliente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relaciones_responsable_visita_id_unique" UNIQUE("visita_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "top_picos_pendientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_id" uuid NOT NULL,
	"referencia_id" uuid NOT NULL,
	"incorporada" boolean DEFAULT false NOT NULL,
	"incorporada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "top_picos_pendientes_accion_id_unique" UNIQUE("accion_id")
);
--> statement-breakpoint
ALTER TABLE "tiendas" ADD COLUMN "canal" "canal";--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "tipo" "tipo_evidencia" DEFAULT 'foto' NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "duracion_s" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referencias_producto" ADD CONSTRAINT "referencias_producto_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acciones" ADD CONSTRAINT "acciones_tienda_id_tiendas_id_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acciones" ADD CONSTRAINT "acciones_visita_origen_id_visitas_id_fk" FOREIGN KEY ("visita_origen_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acciones" ADD CONSTRAINT "acciones_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comprobaciones_accion" ADD CONSTRAINT "comprobaciones_accion_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comprobaciones_accion" ADD CONSTRAINT "comprobaciones_accion_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comprobaciones_accion" ADD CONSTRAINT "comprobaciones_accion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "detecciones_fechas" ADD CONSTRAINT "detecciones_fechas_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "detecciones_hueco" ADD CONSTRAINT "detecciones_hueco_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "detecciones_stock" ADD CONSTRAINT "detecciones_stock_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extraespacios" ADD CONSTRAINT "extraespacios_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ganancias_facings" ADD CONSTRAINT "ganancias_facings_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ganancias_facings" ADD CONSTRAINT "ganancias_facings_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "neveras" ADD CONSTRAINT "neveras_extraespacio_id_extraespacios_id_fk" FOREIGN KEY ("extraespacio_id") REFERENCES "public"."extraespacios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidades_reorganizacion" ADD CONSTRAINT "oportunidades_reorganizacion_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidades_visibilidad" ADD CONSTRAINT "oportunidades_visibilidad_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidades_visibilidad" ADD CONSTRAINT "oportunidades_visibilidad_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relaciones_responsable" ADD CONSTRAINT "relaciones_responsable_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "top_picos_pendientes" ADD CONSTRAINT "top_picos_pendientes_accion_id_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "top_picos_pendientes" ADD CONSTRAINT "top_picos_pendientes_referencia_id_referencias_producto_id_fk" FOREIGN KEY ("referencia_id") REFERENCES "public"."referencias_producto"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marcas_codigo_unico" ON "marcas" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marcas_categoria_idx" ON "marcas" USING btree ("categoria_producto");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referencias_producto_codigo_unico" ON "referencias_producto" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referencias_producto_categoria_idx" ON "referencias_producto" USING btree ("categoria_producto");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referencias_producto_nombre_idx" ON "referencias_producto" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acciones_id_cliente_unico" ON "acciones" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acciones_tienda_estado_idx" ON "acciones" USING btree ("tienda_id","estado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acciones_estado_detectada_idx" ON "acciones" USING btree ("estado","detectada_en");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acciones_responsable_idx" ON "acciones" USING btree ("responsable_actuar","estado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acciones_visita_origen_idx" ON "acciones" USING btree ("visita_origen_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comprobaciones_id_cliente_unico" ON "comprobaciones_accion" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comprobaciones_accion_idx" ON "comprobaciones_accion" USING btree ("accion_id","comprobada_en");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comprobaciones_visita_idx" ON "comprobaciones_accion" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ganancias_facings_marca_idx" ON "ganancias_facings" USING btree ("marca_id","conseguido");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "neveras_codigo_idx" ON "neveras" USING btree ("codigo_nevera");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relaciones_responsable_id_cliente_unico" ON "relaciones_responsable" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "top_picos_referencia_idx" ON "top_picos_pendientes" USING btree ("referencia_id","incorporada");