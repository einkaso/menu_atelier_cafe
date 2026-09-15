ALTER TABLE "product_content" ADD COLUMN "country_en" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "region_en" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "wine_style_en" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "tasting_notes_en" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "auto_translate" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "translation_source_hash" text;