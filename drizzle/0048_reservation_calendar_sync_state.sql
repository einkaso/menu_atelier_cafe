ALTER TABLE "reservations"
ADD COLUMN IF NOT EXISTS "calendar_synced_at" timestamp with time zone;

-- Existing active APP reservations were already subject to the old write-back
-- loop. Mark them as previously synchronized so a remote deletion is treated
-- as a deletion instead of causing the event to be recreated once more.
UPDATE "reservations"
SET "calendar_synced_at" = "updated_at"
WHERE "source" = 'APP'
  AND "status" = 'BOOKED'
  AND "calendar_synced_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "reservation_calendar_settings"
    WHERE "key" = 'main'
      AND "caldav_calendar_url_encrypted" IS NOT NULL
  );
