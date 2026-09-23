ALTER TABLE "waiter_employees"
ADD COLUMN IF NOT EXISTS "can_control_lighting" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "lighting_bridges" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "token_hint" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "agent_version" text,
  "last_heartbeat_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_bridges_token_hash_uq" ON "lighting_bridges" ("token_hash");

CREATE TABLE IF NOT EXISTS "lighting_devices" (
  "id" serial PRIMARY KEY,
  "bridge_id" integer NOT NULL REFERENCES "lighting_bridges"("id") ON DELETE CASCADE,
  "stable_id" text NOT NULL,
  "name" text NOT NULL,
  "host" text NOT NULL,
  "api_type" text NOT NULL,
  "api_level" text,
  "hardware_version" text,
  "firmware_version" text,
  "channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_seen_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_devices_bridge_stable_uq" ON "lighting_devices" ("bridge_id", "stable_id");
CREATE INDEX IF NOT EXISTS "lighting_devices_bridge_idx" ON "lighting_devices" ("bridge_id");

CREATE TABLE IF NOT EXISTS "lighting_rooms" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "geometry" jsonb,
  "active" boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS "lighting_rooms_sort_idx" ON "lighting_rooms" ("sort_order");

CREATE TABLE IF NOT EXISTS "lighting_outputs" (
  "id" serial PRIMARY KEY,
  "device_id" integer NOT NULL REFERENCES "lighting_devices"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "label" text NOT NULL,
  "room_id" integer REFERENCES "lighting_rooms"("id") ON DELETE SET NULL,
  "capabilities" jsonb DEFAULT '{"onOff":true,"dimming":false}'::jsonb NOT NULL,
  "map_x" numeric(6, 5),
  "map_y" numeric(6, 5),
  "min_brightness" integer DEFAULT 0 NOT NULL,
  "max_brightness" integer DEFAULT 100 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_outputs_device_channel_uq" ON "lighting_outputs" ("device_id", "channel");
CREATE INDEX IF NOT EXISTS "lighting_outputs_room_idx" ON "lighting_outputs" ("room_id");

CREATE TABLE IF NOT EXISTS "lighting_layouts" (
  "id" serial PRIMARY KEY,
  "image_path" text NOT NULL,
  "image_width" integer NOT NULL,
  "image_height" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lighting_groups" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS "lighting_groups_sort_idx" ON "lighting_groups" ("sort_order");

CREATE TABLE IF NOT EXISTS "lighting_group_members" (
  "id" serial PRIMARY KEY,
  "group_id" integer NOT NULL REFERENCES "lighting_groups"("id") ON DELETE CASCADE,
  "output_id" integer NOT NULL REFERENCES "lighting_outputs"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_group_members_group_output_uq" ON "lighting_group_members" ("group_id", "output_id");

CREATE TABLE IF NOT EXISTS "lighting_scenes" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS "lighting_scenes_sort_idx" ON "lighting_scenes" ("sort_order");

CREATE TABLE IF NOT EXISTS "lighting_scene_actions" (
  "id" serial PRIMARY KEY,
  "scene_id" integer NOT NULL REFERENCES "lighting_scenes"("id") ON DELETE CASCADE,
  "output_id" integer NOT NULL REFERENCES "lighting_outputs"("id") ON DELETE CASCADE,
  "command" text NOT NULL,
  "brightness" integer
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_scene_actions_scene_output_uq" ON "lighting_scene_actions" ("scene_id", "output_id");

CREATE TABLE IF NOT EXISTS "lighting_output_states" (
  "id" serial PRIMARY KEY,
  "output_id" integer NOT NULL REFERENCES "lighting_outputs"("id") ON DELETE CASCADE,
  "is_on" boolean,
  "brightness" integer,
  "observed_at" timestamp with time zone,
  "quality" text DEFAULT 'UNKNOWN' NOT NULL,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_output_states_output_uq" ON "lighting_output_states" ("output_id");

CREATE TABLE IF NOT EXISTS "lighting_commands" (
  "id" text PRIMARY KEY,
  "bridge_id" integer REFERENCES "lighting_bridges"("id") ON DELETE SET NULL,
  "actor_dotykacka_id" text NOT NULL,
  "actor_name" text NOT NULL,
  "kind" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'QUEUED' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_commands_idempotency_uq" ON "lighting_commands" ("actor_dotykacka_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "lighting_commands_status_expiry_idx" ON "lighting_commands" ("status", "expires_at");

CREATE TABLE IF NOT EXISTS "lighting_command_items" (
  "id" serial PRIMARY KEY,
  "command_id" text NOT NULL REFERENCES "lighting_commands"("id") ON DELETE CASCADE,
  "output_id" integer NOT NULL REFERENCES "lighting_outputs"("id") ON DELETE CASCADE,
  "previous_is_on" boolean,
  "previous_brightness" integer,
  "requested_command" text NOT NULL,
  "requested_brightness" integer,
  "result" text,
  "error" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "lighting_command_items_command_output_uq" ON "lighting_command_items" ("command_id", "output_id");
