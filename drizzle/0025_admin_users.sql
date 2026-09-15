CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_employee_dotykacka_id_uq" UNIQUE("employee_dotykacka_id"),
	CONSTRAINT "admin_users_username_uq" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX "admin_users_enabled_idx" ON "admin_users" USING btree ("enabled");
