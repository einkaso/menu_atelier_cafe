ALTER TABLE "menu_products" ADD COLUMN "source_sort_order" integer;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "menu_sort_order" integer;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "menu_group" text;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "allergens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb NOT NULL;