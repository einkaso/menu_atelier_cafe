CREATE TABLE "dotykacka_stock_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"cloud_id" text,
	"warehouse_id" text,
	"dotykacka_product_id" text,
	"dotykacka_supplier_id" text,
	"quantity" numeric(14, 3),
	"event_type" text,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dotykacka_stock_events_fingerprint_uq" ON "dotykacka_stock_events" USING btree ("fingerprint");