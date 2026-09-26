ALTER TABLE "lighting_scene_actions"
  ADD COLUMN IF NOT EXISTS "start_delay_ms" integer DEFAULT 0 NOT NULL;

ALTER TABLE "lighting_scene_actions"
  DROP CONSTRAINT IF EXISTS "lighting_scene_actions_start_delay_check";
ALTER TABLE "lighting_scene_actions"
  ADD CONSTRAINT "lighting_scene_actions_start_delay_check"
  CHECK ("start_delay_ms" >= 0 AND "start_delay_ms" <= 3600000);
