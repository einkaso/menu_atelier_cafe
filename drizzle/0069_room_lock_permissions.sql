CREATE TABLE "room_lock_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"lock_id" text NOT NULL,
	"lock_name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "room_lock_permissions_employee_lock_uq" ON "room_lock_permissions" USING btree ("employee_dotykacka_id","lock_id");
--> statement-breakpoint
CREATE INDEX "room_lock_permissions_lock_idx" ON "room_lock_permissions" USING btree ("lock_id");
