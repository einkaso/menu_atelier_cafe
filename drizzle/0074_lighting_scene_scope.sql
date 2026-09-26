ALTER TABLE "lighting_scenes"
  ADD COLUMN IF NOT EXISTS "room_id" integer;

DO $$ BEGIN
  ALTER TABLE "lighting_scenes"
    ADD CONSTRAINT "lighting_scenes_room_id_lighting_rooms_id_fk"
    FOREIGN KEY ("room_id") REFERENCES "public"."lighting_rooms"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "lighting_scenes_room_idx"
  ON "lighting_scenes" USING btree ("room_id");
