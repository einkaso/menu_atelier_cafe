CREATE TABLE "event_os_events" (
  "external_id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "status" text DEFAULT 'COLLECTING' NOT NULL,
  "discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "order_cutoff_at" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_os_product_access" (
  "product_id" integer PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_os_orders" (
  "external_id" text PRIMARY KEY NOT NULL,
  "event_external_id" text NOT NULL,
  "ticket_code" text NOT NULL,
  "guest_name" text NOT NULL,
  "guest_email" text,
  "guest_phone" text,
  "table_label" text,
  "status" text DEFAULT 'RESERVED' NOT NULL,
  "special_request" text,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "regular_total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "discount_total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "forecast_total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "dotykacka_order_id" text,
  "ordered_at" timestamp with time zone NOT NULL,
  "arrived_at" timestamp with time zone,
  "sent_to_pos_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_os_product_access" ADD CONSTRAINT "event_os_product_access_product_id_menu_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."menu_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_os_orders" ADD CONSTRAINT "event_os_orders_event_external_id_event_os_events_external_id_fk" FOREIGN KEY ("event_external_id") REFERENCES "public"."event_os_events"("external_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "event_os_events_starts_idx" ON "event_os_events" USING btree ("starts_at");
--> statement-breakpoint
CREATE INDEX "event_os_orders_event_status_idx" ON "event_os_orders" USING btree ("event_external_id", "status");
--> statement-breakpoint
CREATE INDEX "event_os_orders_ticket_idx" ON "event_os_orders" USING btree ("ticket_code");
