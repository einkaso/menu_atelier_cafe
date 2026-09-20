ALTER TABLE "product_content" ADD COLUMN "waiter_visibility_override" boolean;--> statement-breakpoint
ALTER TABLE "waiter_employees" ADD COLUMN "can_manage_menu_visibility" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "menu_visibility_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"product_dotykacka_id" text NOT NULL,
	"product_name" text NOT NULL,
	"category_name" text NOT NULL,
	"previous_visible" boolean NOT NULL,
	"visible" boolean NOT NULL,
	"reason" text NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "menu_visibility_events_created_idx" ON "menu_visibility_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "menu_visibility_events_employee_idx" ON "menu_visibility_events" USING btree ("employee_dotykacka_id");--> statement-breakpoint
CREATE INDEX "menu_visibility_events_product_idx" ON "menu_visibility_events" USING btree ("product_dotykacka_id");
