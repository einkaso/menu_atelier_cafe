CREATE TABLE "staff_instructions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "staff_instructions_status_idx" ON "staff_instructions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "staff_instructions_published_idx" ON "staff_instructions" USING btree ("published_at");
--> statement-breakpoint
CREATE TABLE "staff_instruction_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"instruction_id" integer NOT NULL,
	"instruction_revision" integer NOT NULL,
	"employee_dotykacka_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"first_presented_at" timestamp with time zone,
	"deferred_at" timestamp with time zone,
	"deferred_until" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_instruction_receipts_instruction_id_staff_instructions_id_fk" FOREIGN KEY ("instruction_id") REFERENCES "public"."staff_instructions"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_instruction_receipts_instruction_employee_revision_uq" ON "staff_instruction_receipts" USING btree ("instruction_id","employee_dotykacka_id","instruction_revision");
--> statement-breakpoint
CREATE INDEX "staff_instruction_receipts_employee_idx" ON "staff_instruction_receipts" USING btree ("employee_dotykacka_id");
--> statement-breakpoint
CREATE INDEX "staff_instruction_receipts_instruction_idx" ON "staff_instruction_receipts" USING btree ("instruction_id");
--> statement-breakpoint
CREATE INDEX "staff_instruction_receipts_deferred_idx" ON "staff_instruction_receipts" USING btree ("deferred_until");
