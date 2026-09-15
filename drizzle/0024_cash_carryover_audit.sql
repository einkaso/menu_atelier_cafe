ALTER TABLE "waiter_cash_days" ADD COLUMN "carryover_cash_day_id" integer;
--> statement-breakpoint
ALTER TABLE "waiter_cash_days" ADD COLUMN "carryover_declared_by_dotykacka_id" text;
--> statement-breakpoint
ALTER TABLE "waiter_cash_days" ADD COLUMN "carryover_declared_by_name" text;
--> statement-breakpoint
ALTER TABLE "waiter_cash_days" ADD COLUMN "carryover_declared_at" timestamp with time zone;
