CREATE TABLE "admin_dashboard_preferences" (
	"administrator_key" text PRIMARY KEY NOT NULL,
	"tiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
