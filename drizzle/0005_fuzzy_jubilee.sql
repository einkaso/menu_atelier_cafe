ALTER TABLE "menu_products" ADD COLUMN "sales_count_30d" numeric(14, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "sales_synced_at" timestamp with time zone;