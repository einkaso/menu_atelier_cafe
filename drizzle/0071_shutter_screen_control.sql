ALTER TABLE "lighting_outputs"
ADD COLUMN IF NOT EXISTS "preferred_position" integer DEFAULT 75 NOT NULL;

ALTER TABLE "lighting_output_states"
ADD COLUMN IF NOT EXISTS "position" integer,
ADD COLUMN IF NOT EXISTS "desired_position" integer,
ADD COLUMN IF NOT EXISTS "motion" text,
ADD COLUMN IF NOT EXISTS "calibrated" boolean;

ALTER TABLE "lighting_command_items"
ADD COLUMN IF NOT EXISTS "requested_position" integer;

DO $$ BEGIN
  ALTER TABLE "lighting_outputs" ADD CONSTRAINT "lighting_outputs_preferred_position_range" CHECK ("preferred_position" BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lighting_output_states" ADD CONSTRAINT "lighting_output_states_position_range" CHECK ("position" IS NULL OR "position" BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lighting_output_states" ADD CONSTRAINT "lighting_output_states_desired_position_range" CHECK ("desired_position" IS NULL OR "desired_position" BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lighting_command_items" ADD CONSTRAINT "lighting_command_items_requested_position_range" CHECK ("requested_position" IS NULL OR "requested_position" BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
