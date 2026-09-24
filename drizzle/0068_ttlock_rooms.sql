ALTER TABLE "waiter_employees" ADD COLUMN "can_control_rooms" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "room_lock_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_dotykacka_id" text,
	"actor_name" text NOT NULL,
	"lock_id" text NOT NULL,
	"lock_name" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "room_lock_events_lock_created_idx" ON "room_lock_events" USING btree ("lock_id","created_at");
--> statement-breakpoint
CREATE INDEX "room_lock_events_actor_created_idx" ON "room_lock_events" USING btree ("actor_dotykacka_id","created_at");
