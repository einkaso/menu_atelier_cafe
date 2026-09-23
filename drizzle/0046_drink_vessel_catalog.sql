CREATE TABLE "drink_vessels" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"capacity_ml" integer NOT NULL,
	"icon_path" text,
	"source_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drink_vessels_capacity_ml_check" CHECK ("drink_vessels"."capacity_ml" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drink_vessels_key_uq" ON "drink_vessels" USING btree ("key");
--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "drink_vessel_id" integer;
--> statement-breakpoint
ALTER TABLE "product_content" ADD COLUMN "espresso_shots" integer;
--> statement-breakpoint
ALTER TABLE "product_content" ADD CONSTRAINT "product_content_drink_vessel_id_drink_vessels_id_fk" FOREIGN KEY ("drink_vessel_id") REFERENCES "public"."drink_vessels"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_content" ADD CONSTRAINT "product_content_espresso_shots_check" CHECK ("product_content"."espresso_shots" is null or "product_content"."espresso_shots" in (1, 2));
