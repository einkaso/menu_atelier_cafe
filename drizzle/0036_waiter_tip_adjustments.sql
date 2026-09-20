CREATE TABLE "waiter_tip_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"business_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"payout_status" text DEFAULT 'DUE' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "waiter_tip_adjustments_employee_idx" ON "waiter_tip_adjustments" USING btree ("employee_dotykacka_id");
--> statement-breakpoint
CREATE INDEX "waiter_tip_adjustments_date_idx" ON "waiter_tip_adjustments" USING btree ("business_date");
--> statement-breakpoint
CREATE INDEX "waiter_tip_adjustments_status_idx" ON "waiter_tip_adjustments" USING btree ("payout_status");
