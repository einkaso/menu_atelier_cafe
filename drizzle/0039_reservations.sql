CREATE TABLE IF NOT EXISTS "reservations" (
  "id" serial PRIMARY KEY,
  "external_uid" text,
  "source" text DEFAULT 'APP' NOT NULL,
  "guest_name" text NOT NULL,
  "guest_contact" text NOT NULL,
  "party_size" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "location" text NOT NULL,
  "special_request" text,
  "status" text DEFAULT 'BOOKED' NOT NULL,
  "table_ready_at" timestamp with time zone,
  "table_ready_by_dotykacka_id" text,
  "table_ready_by_name" text,
  "special_request_ready_at" timestamp with time zone,
  "special_request_ready_by_dotykacka_id" text,
  "special_request_ready_by_name" text,
  "added_by_dotykacka_id" text,
  "added_by_name" text NOT NULL,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_external_uid_uq" ON "reservations" ("external_uid");
CREATE INDEX IF NOT EXISTS "reservations_starts_status_idx" ON "reservations" ("starts_at", "status");

CREATE TABLE IF NOT EXISTS "reservation_notifications" (
  "id" serial PRIMARY KEY,
  "reservation_id" integer NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
  "employee_dotykacka_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "two_hour_notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_notifications_reservation_employee_uq" ON "reservation_notifications" ("reservation_id", "employee_dotykacka_id");
CREATE INDEX IF NOT EXISTS "reservation_notifications_employee_idx" ON "reservation_notifications" ("employee_dotykacka_id");

CREATE TABLE IF NOT EXISTS "reservation_events" (
  "id" serial PRIMARY KEY,
  "reservation_id" integer NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "actor_name" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "reservation_events_reservation_idx" ON "reservation_events" ("reservation_id", "created_at");

CREATE TABLE IF NOT EXISTS "reservation_calendar_settings" (
  "key" text PRIMARY KEY DEFAULT 'main',
  "name" text DEFAULT 'Rezerwacje Atelier Café' NOT NULL,
  "import_ical_url_encrypted" text,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
