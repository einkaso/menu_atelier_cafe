CREATE TABLE "waiter_employee_thank_you_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"media_path" text NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "waiter_employee_thanks_employee_idx" ON "waiter_employee_thank_you_media" USING btree ("employee_dotykacka_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_employee_thanks_media_path_uq" ON "waiter_employee_thank_you_media" USING btree ("media_path");
