ALTER TABLE "waiter_employees" ADD COLUMN IF NOT EXISTS "barcode" text;

CREATE TABLE IF NOT EXISTS "work_availability_weeks" (
  "id" serial PRIMARY KEY,
  "employee_dotykacka_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "week_start" date NOT NULL,
  "min_shifts" integer DEFAULT 0 NOT NULL,
  "max_shifts" integer DEFAULT 0 NOT NULL,
  "days" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "work_availability_employee_week_uq" ON "work_availability_weeks" ("employee_dotykacka_id", "week_start");
CREATE INDEX IF NOT EXISTS "work_availability_week_idx" ON "work_availability_weeks" ("week_start");

CREATE TABLE IF NOT EXISTS "work_schedules" (
  "id" serial PRIMARY KEY,
  "week_start" date NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "opening_hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_week_uq" ON "work_schedules" ("week_start");

CREATE TABLE IF NOT EXISTS "work_shifts" (
  "id" serial PRIMARY KEY,
  "schedule_id" integer NOT NULL REFERENCES "work_schedules"("id") ON DELETE CASCADE,
  "employee_dotykacka_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "work_date" date NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "work_shifts_schedule_idx" ON "work_shifts" ("schedule_id");
CREATE INDEX IF NOT EXISTS "work_shifts_employee_date_idx" ON "work_shifts" ("employee_dotykacka_id", "work_date");

CREATE TABLE IF NOT EXISTS "work_schedule_receipts" (
  "id" serial PRIMARY KEY,
  "schedule_id" integer NOT NULL REFERENCES "work_schedules"("id") ON DELETE CASCADE,
  "schedule_version" integer NOT NULL,
  "employee_dotykacka_id" text NOT NULL,
  "seen_at" timestamp with time zone,
  "calendar_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedule_receipts_employee_version_uq" ON "work_schedule_receipts" ("schedule_id", "schedule_version", "employee_dotykacka_id");
CREATE INDEX IF NOT EXISTS "work_schedule_receipts_employee_idx" ON "work_schedule_receipts" ("employee_dotykacka_id");

CREATE TABLE IF NOT EXISTS "work_time_entries" (
  "id" serial PRIMARY KEY,
  "employee_dotykacka_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "shift_id" integer REFERENCES "work_shifts"("id") ON DELETE SET NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "worked_minutes" integer,
  "source" text DEFAULT 'QR_KIOSK' NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "approved_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "work_time_entries_employee_start_idx" ON "work_time_entries" ("employee_dotykacka_id", "started_at");
CREATE INDEX IF NOT EXISTS "work_time_entries_status_idx" ON "work_time_entries" ("status");

CREATE TABLE IF NOT EXISTS "work_time_events" (
  "id" serial PRIMARY KEY,
  "entry_id" integer REFERENCES "work_time_entries"("id") ON DELETE SET NULL,
  "employee_dotykacka_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "action" text NOT NULL,
  "kiosk_name" text DEFAULT 'Tablet wejściowy' NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "work_time_events_employee_idx" ON "work_time_events" ("employee_dotykacka_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "work_time_correction_requests" (
  "id" serial PRIMARY KEY,
  "employee_dotykacka_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "work_date" date NOT NULL,
  "requested_start" timestamp with time zone NOT NULL,
  "requested_end" timestamp with time zone NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "reviewed_by" text,
  "review_note" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "work_time_corrections_status_idx" ON "work_time_correction_requests" ("status");
CREATE INDEX IF NOT EXISTS "work_time_corrections_employee_idx" ON "work_time_correction_requests" ("employee_dotykacka_id", "work_date");

CREATE TABLE IF NOT EXISTS "workforce_calendar_settings" (
  "key" text PRIMARY KEY DEFAULT 'main',
  "name" text DEFAULT 'Kalendarz wydarzeń' NOT NULL,
  "ical_url_encrypted" text,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
