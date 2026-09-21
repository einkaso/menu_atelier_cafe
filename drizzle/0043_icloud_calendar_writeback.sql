ALTER TABLE "reservation_calendar_settings"
ADD COLUMN IF NOT EXISTS "caldav_username_encrypted" text;

ALTER TABLE "reservation_calendar_settings"
ADD COLUMN IF NOT EXISTS "caldav_password_encrypted" text;

ALTER TABLE "reservation_calendar_settings"
ADD COLUMN IF NOT EXISTS "caldav_calendar_url_encrypted" text;

ALTER TABLE "reservation_calendar_settings"
ADD COLUMN IF NOT EXISTS "caldav_calendar_name" text;

ALTER TABLE "reservation_calendar_settings"
ADD COLUMN IF NOT EXISTS "caldav_connected_at" timestamp with time zone;
