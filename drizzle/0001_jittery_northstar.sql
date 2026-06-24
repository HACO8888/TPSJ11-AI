CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"scope" text NOT NULL,
	"code" text,
	"status" integer,
	"message" text,
	"detail" text,
	"session_id" uuid,
	"path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "error_logs_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE INDEX "error_logs_created_idx" ON "error_logs" USING btree ("created_at");