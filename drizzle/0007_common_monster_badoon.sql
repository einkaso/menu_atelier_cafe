ALTER TABLE "menu_products" ADD COLUMN "catalog_code" text;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "plu_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "license_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;