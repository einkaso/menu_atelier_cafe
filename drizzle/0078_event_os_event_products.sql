CREATE TABLE "event_os_event_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_external_id" text NOT NULL,
  "product_id" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_os_event_products" ADD CONSTRAINT "event_os_event_products_event_external_id_event_os_events_external_id_fk" FOREIGN KEY ("event_external_id") REFERENCES "public"."event_os_events"("external_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_os_event_products" ADD CONSTRAINT "event_os_event_products_product_id_menu_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."menu_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "event_os_event_products_event_product_uq" ON "event_os_event_products" USING btree ("event_external_id", "product_id");
--> statement-breakpoint
CREATE INDEX "event_os_event_products_event_idx" ON "event_os_event_products" USING btree ("event_external_id");
