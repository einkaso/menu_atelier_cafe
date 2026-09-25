ALTER TABLE "lighting_scene_actions"
  ADD COLUMN IF NOT EXISTS "fade_duration_ms" integer DEFAULT 0 NOT NULL;

ALTER TABLE "lighting_commands"
  ADD COLUMN IF NOT EXISTS "scene_id" integer,
  ADD COLUMN IF NOT EXISTS "execute_at" timestamp with time zone DEFAULT now() NOT NULL;

DO $$ BEGIN
  ALTER TABLE "lighting_commands"
    ADD CONSTRAINT "lighting_commands_scene_id_lighting_scenes_id_fk"
    FOREIGN KEY ("scene_id") REFERENCES "public"."lighting_scenes"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "lighting_commands_status_execute_idx"
  ON "lighting_commands" USING btree ("status", "execute_at");

ALTER TABLE "lighting_scene_actions"
  DROP CONSTRAINT IF EXISTS "lighting_scene_actions_fade_duration_check";
ALTER TABLE "lighting_scene_actions"
  ADD CONSTRAINT "lighting_scene_actions_fade_duration_check"
  CHECK ("fade_duration_ms" >= 0 AND "fade_duration_ms" <= 300000);
