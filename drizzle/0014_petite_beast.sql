CREATE TABLE "menu_group_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_group_orders" ADD CONSTRAINT "menu_group_orders_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_group_orders_category_group_uq" ON "menu_group_orders" USING btree ("category_id","group_name");