ALTER TABLE "waiter_settlements" ADD COLUMN "deposits" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "waiter_settlements" ADD COLUMN "deposits_total" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
CREATE TABLE "waiter_cash_deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"cash_day_id" integer NOT NULL,
	"settlement_id" integer,
	"contributor" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_by_dotykacka_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"updated_by_dotykacka_id" text NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "waiter_cash_deposits" ADD CONSTRAINT "waiter_cash_deposits_cash_day_id_waiter_cash_days_id_fk" FOREIGN KEY ("cash_day_id") REFERENCES "public"."waiter_cash_days"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiter_cash_deposits" ADD CONSTRAINT "waiter_cash_deposits_settlement_id_waiter_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."waiter_settlements"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "waiter_cash_deposits_day_status_idx" ON "waiter_cash_deposits" USING btree ("cash_day_id", "status");
--> statement-breakpoint
CREATE INDEX "waiter_cash_deposits_settlement_idx" ON "waiter_cash_deposits" USING btree ("settlement_id");
