CREATE TABLE "guest_survey_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"kind" text DEFAULT 'SINGLE_CHOICE' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"dotykacka_order_id" text NOT NULL,
	"document_number" text NOT NULL,
	"table_dotykacka_id" text,
	"presented_by_employee_dotykacka_id" text NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "guest_survey_responses_order_uq" ON "guest_survey_responses" USING btree ("dotykacka_order_id");
--> statement-breakpoint
INSERT INTO "guest_survey_questions" ("prompt", "kind", "options", "required", "active", "sort_order") VALUES
	('Jak oceniasz dzisiejszą wizytę?', 'RATING', '["1", "2", "3", "4", "5"]'::jsonb, false, true, 10),
	('Co podobało Ci się najbardziej?', 'SINGLE_CHOICE', '["Obsługa", "Kawa i napoje", "Jedzenie", "Atmosfera", "Wydarzenie"]'::jsonb, false, true, 20),
	('Czy odwiedzisz nas ponownie?', 'SINGLE_CHOICE', '["Tak", "Raczej tak", "Jeszcze nie wiem"]'::jsonb, false, true, 30);
