CREATE TABLE IF NOT EXISTS "cold_storage_sensor_states" (
  "id" serial PRIMARY KEY,
  "bridge_id" integer NOT NULL REFERENCES "lighting_bridges"("id") ON DELETE CASCADE,
  "sensor_key" text NOT NULL,
  "name" text NOT NULL,
  "temperature_c" numeric(6, 2) NOT NULL,
  "alarm_threshold_c" numeric(6, 2) DEFAULT '-8.00' NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "cold_storage_sensor_states_temperature_range" CHECK ("temperature_c" >= -100 AND "temperature_c" <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "cold_storage_sensor_states_key_uq" ON "cold_storage_sensor_states" ("sensor_key");
CREATE INDEX IF NOT EXISTS "cold_storage_sensor_states_observed_idx" ON "cold_storage_sensor_states" ("observed_at");
