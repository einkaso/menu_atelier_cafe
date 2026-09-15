CREATE TABLE "waiter_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"business_date" date NOT NULL,
	"shift_name" text NOT NULL,
	"cash_desk" text NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"opening_cash" numeric(12, 2) NOT NULL,
	"pos_cash" numeric(12, 2) NOT NULL,
	"pos_card" numeric(12, 2) NOT NULL,
	"terminal_card" numeric(12, 2) NOT NULL,
	"counted_cash" numeric(12, 2) NOT NULL,
	"cash_left" numeric(12, 2) NOT NULL,
	"envelope_cash" numeric(12, 2) NOT NULL,
	"envelope_number" text,
	"corrections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expenses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_cash" numeric(12, 2) NOT NULL,
	"cash_difference" numeric(12, 2) NOT NULL,
	"expected_terminal" numeric(12, 2) NOT NULL,
	"terminal_difference" numeric(12, 2) NOT NULL,
	"expenses_total" numeric(12, 2) NOT NULL,
	"tips_total" numeric(12, 2) NOT NULL,
	"discrepancy_note" text,
	"employee_note" text,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"admin_note" text,
	"verified_by" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_settlements_external_id_uq" ON "waiter_settlements" USING btree ("external_id");
--> statement-breakpoint
CREATE INDEX "waiter_settlements_business_date_idx" ON "waiter_settlements" USING btree ("business_date");
--> statement-breakpoint
CREATE INDEX "waiter_settlements_employee_idx" ON "waiter_settlements" USING btree ("employee_dotykacka_id");
--> statement-breakpoint
CREATE TABLE "waiter_tip_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"tip_key" text NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"payment_method" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payout_status" text DEFAULT 'DUE' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waiter_tip_allocations" ADD CONSTRAINT "waiter_tip_allocations_settlement_id_waiter_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."waiter_settlements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "waiter_tip_allocations_employee_idx" ON "waiter_tip_allocations" USING btree ("employee_dotykacka_id");
--> statement-breakpoint
CREATE INDEX "waiter_tip_allocations_settlement_idx" ON "waiter_tip_allocations" USING btree ("settlement_id");
--> statement-breakpoint
CREATE TABLE "waiter_settlement_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waiter_settlement_events" ADD CONSTRAINT "waiter_settlement_events_settlement_id_waiter_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."waiter_settlements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "waiter_settlement_events_settlement_idx" ON "waiter_settlement_events" USING btree ("settlement_id");
