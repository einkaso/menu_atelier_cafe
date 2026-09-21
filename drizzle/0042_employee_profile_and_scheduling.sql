ALTER TABLE "waiter_employees"
ADD COLUMN IF NOT EXISTS "include_in_schedule" boolean DEFAULT true NOT NULL;

ALTER TABLE "waiter_employees"
ADD COLUMN IF NOT EXISTS "hourly_rate" numeric(10, 2);

ALTER TABLE "waiter_employees"
ADD COLUMN IF NOT EXISTS "contact_phone" text;

ALTER TABLE "waiter_employees"
ADD COLUMN IF NOT EXISTS "contact_email" text;
