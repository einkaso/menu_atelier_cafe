CREATE TABLE IF NOT EXISTS "waiter_extra_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "dotykacka_id" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "category_sort_order" integer,
  "product_sort_order" integer,
  "price_with_vat" numeric(12, 2),
  "currency" text DEFAULT 'PLN' NOT NULL,
  "stock_deduct" boolean DEFAULT false NOT NULL,
  "stock_overdraft" text DEFAULT 'ALLOW' NOT NULL,
  "stock_quantity" numeric(14, 3),
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_version" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waiter_extra_products_dotykacka_id_uq" ON "waiter_extra_products" USING btree ("dotykacka_id");
