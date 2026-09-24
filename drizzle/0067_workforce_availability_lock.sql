ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "availability_locked" boolean DEFAULT false NOT NULL;
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "availability_locked_at" timestamp with time zone;
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "availability_locked_by" text;
