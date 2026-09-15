CREATE TABLE IF NOT EXISTS "waiter_employees" (
  "id" serial PRIMARY KEY NOT NULL,
  "dotykacka_id" text NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL,
  "access_level" text,
  "require_pin_always" boolean DEFAULT false NOT NULL,
  "pin_hash" text,
  "source_version" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waiter_employees_dotykacka_id_uq" ON "waiter_employees" USING btree ("dotykacka_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiter_tables" (
  "id" serial PRIMARY KEY NOT NULL,
  "dotykacka_id" text NOT NULL,
  "name" text NOT NULL,
  "display" boolean DEFAULT true NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL,
  "source_version" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waiter_tables_dotykacka_id_uq" ON "waiter_tables" USING btree ("dotykacka_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiter_survey_questions" (
  "id" serial PRIMARY KEY NOT NULL,
  "prompt" text NOT NULL,
  "kind" text DEFAULT 'YES_NO' NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "waiter_survey_questions" ("prompt", "kind", "options", "required", "active", "sort_order")
SELECT seed."prompt", seed."kind", seed."options", false, true, seed."sort_order"
FROM (VALUES
  ('Czy gość jest u nas pierwszy raz?', 'YES_NO', '["Tak","Nie"]'::jsonb, 0),
  ('Skąd gość dowiedział się o Atelier Café?', 'SINGLE_CHOICE', '["Polecenie","Spacer lub okolica","Instagram lub Facebook","Google","Wydarzenie","Inne"]'::jsonb, 1),
  ('Czy rozmawialiśmy z gościem o naszych wydarzeniach?', 'YES_NO', '["Tak","Nie"]'::jsonb, 2)
) AS seed("prompt", "kind", "options", "sort_order")
WHERE NOT EXISTS (SELECT 1 FROM "waiter_survey_questions");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiter_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "external_id" text NOT NULL,
  "employee_dotykacka_id" text NOT NULL,
  "table_dotykacka_id" text NOT NULL,
  "guest_count" integer DEFAULT 1 NOT NULL,
  "note" text,
  "items" jsonb NOT NULL,
  "survey_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "dotykacka_order_id" text,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waiter_orders_external_id_uq" ON "waiter_orders" USING btree ("external_id");
