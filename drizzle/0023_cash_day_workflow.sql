CREATE TABLE "waiter_cash_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_date" date NOT NULL,
	"cash_desk" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"expected_opening_cash" numeric(12, 2) NOT NULL,
	"counted_opening_cash" numeric(12, 2) NOT NULL,
	"opening_difference" numeric(12, 2) NOT NULL,
	"opening_note" text,
	"opening_pos_cash" numeric(12, 2) NOT NULL,
	"opening_pos_card" numeric(12, 2) NOT NULL,
	"opening_snapshot_at" timestamp with time zone NOT NULL,
	"opening_snapshot_from" timestamp with time zone NOT NULL,
	"opening_snapshot_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opened_by_dotykacka_id" text NOT NULL,
	"opened_by_name" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"final_cash_left" numeric(12, 2),
	"closed_by_dotykacka_id" text,
	"closed_by_name" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_cash_days_date_desk_uq" ON "waiter_cash_days" USING btree ("business_date", "cash_desk");
--> statement-breakpoint
CREATE INDEX "waiter_cash_days_status_idx" ON "waiter_cash_days" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "cash_day_id" integer;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "checkpoint_type" text DEFAULT 'LEGACY' NOT NULL;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "prior_settlement_id" integer;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "pos_snapshot_cash" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "pos_snapshot_card" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "pos_snapshot_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "pos_snapshot_from" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "pos_snapshot_details" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD CONSTRAINT "waiter_settlements_cash_day_id_waiter_cash_days_id_fk" FOREIGN KEY ("cash_day_id") REFERENCES "public"."waiter_cash_days"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "waiter_settlements_cash_day_idx" ON "waiter_settlements" USING btree ("cash_day_id");
