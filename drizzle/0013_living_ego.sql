CREATE TABLE "menu_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_dotykacka_id" text NOT NULL,
	"addon_dotykacka_id" text NOT NULL,
	"group_name" text,
	"name" text NOT NULL,
	"name_en" text,
	"price_with_vat" numeric(12, 2),
	"currency" text DEFAULT 'PLN' NOT NULL,
	"sort_order" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "featured_sort_order" integer;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_addons_parent_addon_uq" ON "menu_addons" USING btree ("parent_dotykacka_id","addon_dotykacka_id");
--> statement-breakpoint
-- Earlier versions copied the raw POS description directly to the public
-- description. Move exact copies back to the proposal-only workflow.
UPDATE "product_content" AS content
SET "description_pl" = NULL,
    "description_en" = NULL,
    "translation_source_hash" = NULL,
    "updated_at" = now()
FROM "menu_products" AS product
WHERE content."product_id" = product."id"
  AND NULLIF(btrim(product."source_description"), '') IS NOT NULL
  AND btrim(content."description_pl") = btrim(product."source_description");
