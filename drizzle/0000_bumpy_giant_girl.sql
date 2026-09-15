CREATE TABLE "menu_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"dotykacka_id" text NOT NULL,
	"name" text NOT NULL,
	"display" boolean DEFAULT true NOT NULL,
	"sort_order" integer,
	"source_version" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"dotykacka_id" text NOT NULL,
	"dotykacka_category_id" text,
	"name" text NOT NULL,
	"source_description" text,
	"price_with_vat" numeric(12, 2),
	"currency" text DEFAULT 'PLN' NOT NULL,
	"display" boolean DEFAULT true NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"stock_deduct" boolean DEFAULT false NOT NULL,
	"stock_quantity" numeric(14, 3),
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"menu_tagged" boolean DEFAULT false NOT NULL,
	"source_version" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name_en" text,
	"description_pl" text,
	"description_en" text,
	"image_path" text,
	"image_source_url" text,
	"featured" boolean DEFAULT false NOT NULL,
	"hide_when_out_of_stock" boolean DEFAULT false NOT NULL,
	"manual_hidden" boolean DEFAULT false NOT NULL,
	"country" text,
	"region" text,
	"grapes" text,
	"wine_style" text,
	"tasting_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"products_seen" integer DEFAULT 0 NOT NULL,
	"products_imported" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_content" ADD CONSTRAINT "product_content_product_id_menu_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."menu_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_dotykacka_id_uq" ON "menu_categories" USING btree ("dotykacka_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_products_dotykacka_id_uq" ON "menu_products" USING btree ("dotykacka_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_content_product_id_uq" ON "product_content" USING btree ("product_id");
