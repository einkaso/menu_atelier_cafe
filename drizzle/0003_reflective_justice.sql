CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"dotykacka_id" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wine_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"supplier_id" integer,
	"fingerprint" text NOT NULL,
	"source_url" text,
	"source_kind" text DEFAULT 'DOTYKACKA' NOT NULL,
	"ean" text,
	"supplier_product_code" text,
	"proposed_content" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decision" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "wine_code" text;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "dotykacka_supplier_id" text;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "supplier_product_code" text;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "ean_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "wine_sources" ADD CONSTRAINT "wine_sources_product_id_menu_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."menu_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_sources" ADD CONSTRAINT "wine_sources_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_dotykacka_id_uq" ON "suppliers" USING btree ("dotykacka_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wine_sources_product_fingerprint_uq" ON "wine_sources" USING btree ("product_id","fingerprint");