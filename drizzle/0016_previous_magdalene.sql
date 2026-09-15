CREATE TABLE "menu_offer_settings" (
	"key" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"season" text,
	"special_enabled" boolean DEFAULT false NOT NULL,
	"special_name_pl" text,
	"special_name_en" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
