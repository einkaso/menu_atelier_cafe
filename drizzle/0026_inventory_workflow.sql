ALTER TABLE "menu_products" ADD COLUMN "stock_unit" text;
--> statement-breakpoint
CREATE TABLE "inventory_catalog_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"dotykacka_id" text NOT NULL,
	"name" text NOT NULL,
	"display" boolean DEFAULT true NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"sort_order" integer,
	"source_version" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_catalog_categories_dotykacka_id_uq" UNIQUE("dotykacka_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_catalog_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"dotykacka_id" text NOT NULL,
	"category_dotykacka_id" text,
	"name" text NOT NULL,
	"display" boolean DEFAULT true NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"stock_deduct" boolean DEFAULT false NOT NULL,
	"stock_quantity" numeric(14, 3),
	"unit" text,
	"price_with_vat" numeric(12, 2),
	"ean_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plu_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wine_code" text,
	"catalog_code" text,
	"image_source_url" text,
	"source_version" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_catalog_products_dotykacka_id_uq" UNIQUE("dotykacka_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'ASSIGNED' NOT NULL,
	"category_dotykacka_id" text NOT NULL,
	"category_name" text NOT NULL,
	"assigned_employee_dotykacka_id" text NOT NULL,
	"assigned_employee_name" text NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"expected_snapshot_at" timestamp with time zone NOT NULL,
	"worker_note" text,
	"admin_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"finished_at" timestamp with time zone,
	CONSTRAINT "inventory_stages_external_id_uq" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_stage_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_id" integer NOT NULL,
	"product_local_id" integer,
	"product_dotykacka_id" text NOT NULL,
	"product_name" text NOT NULL,
	"image_path" text,
	"ean_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plu_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wine_code" text,
	"catalog_code" text,
	"unit" text DEFAULT 'szt.' NOT NULL,
	"expected_quantity" numeric(14, 3) NOT NULL,
	"counted_quantity" numeric(14, 3),
	"reference_price" numeric(12, 2),
	"count_status" text DEFAULT 'PENDING' NOT NULL,
	"reason_code" text,
	"worker_note" text,
	"admin_note" text,
	"counted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_stage_items_stage_product_uq" UNIQUE("stage_id","product_dotykacka_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_count_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"location" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"note" text,
	"created_by_dotykacka_id" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_id" integer NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'READY' NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"stock_transaction_id" text,
	"status_webhook_url" text,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "inventory_exports_stage_uq" UNIQUE("stage_id"),
	CONSTRAINT "inventory_exports_external_id_uq" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_stage_items" ADD CONSTRAINT "inventory_stage_items_stage_id_inventory_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."inventory_stages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_count_entries" ADD CONSTRAINT "inventory_count_entries_item_id_inventory_stage_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_stage_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_stage_id_inventory_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."inventory_stages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_exports" ADD CONSTRAINT "inventory_exports_stage_id_inventory_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."inventory_stages"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "inventory_stages_status_idx" ON "inventory_stages" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "inventory_catalog_products_category_idx" ON "inventory_catalog_products" USING btree ("category_dotykacka_id");
--> statement-breakpoint
CREATE INDEX "inventory_stages_employee_status_idx" ON "inventory_stages" USING btree ("assigned_employee_dotykacka_id","status");
--> statement-breakpoint
CREATE INDEX "inventory_stages_category_created_idx" ON "inventory_stages" USING btree ("category_dotykacka_id","created_at");
--> statement-breakpoint
CREATE INDEX "inventory_stage_items_stage_idx" ON "inventory_stage_items" USING btree ("stage_id");
--> statement-breakpoint
CREATE INDEX "inventory_stage_items_product_idx" ON "inventory_stage_items" USING btree ("product_dotykacka_id");
--> statement-breakpoint
CREATE INDEX "inventory_count_entries_item_idx" ON "inventory_count_entries" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "inventory_events_stage_created_idx" ON "inventory_events" USING btree ("stage_id","created_at");
--> statement-breakpoint
CREATE INDEX "inventory_exports_status_idx" ON "inventory_exports" USING btree ("status");
