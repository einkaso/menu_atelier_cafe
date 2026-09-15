ALTER TABLE "product_content" ADD COLUMN "wine_color" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "sweetness" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "vegan_status" text DEFAULT 'UNKNOWN' NOT NULL;