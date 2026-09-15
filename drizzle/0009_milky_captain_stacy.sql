CREATE TABLE "dotykacka_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'dotykacka' NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"cloud_id" text NOT NULL,
	"warehouse_id" text,
	"branch_id" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dotykacka_connections_provider_uq" ON "dotykacka_connections" USING btree ("provider");