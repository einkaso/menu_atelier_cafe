ALTER TABLE "product_content" ADD COLUMN "staff_instructions" text;--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "staff_media" jsonb DEFAULT '[]'::jsonb NOT NULL;