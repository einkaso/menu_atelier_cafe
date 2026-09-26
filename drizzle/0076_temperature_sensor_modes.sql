ALTER TABLE "cold_storage_sensor_states"
  ADD COLUMN IF NOT EXISTS "monitoring_enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "cold_storage_sensor_states"
  ADD COLUMN IF NOT EXISTS "monitoring_updated_at" timestamp with time zone;

ALTER TABLE "cold_storage_sensor_states"
  ADD COLUMN IF NOT EXISTS "monitoring_updated_by_dotykacka_id" text;

ALTER TABLE "cold_storage_sensor_states"
  ADD COLUMN IF NOT EXISTS "monitoring_updated_by_name" text;

UPDATE "cold_storage_sensor_states"
SET "monitoring_enabled" = false
WHERE "sensor_key" IN ('room-ambient', 'fridge-glass');
