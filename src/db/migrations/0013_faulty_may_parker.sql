CREATE TABLE "base_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"uploaded_by" text,
	"config" jsonb,
	"progress_done" integer DEFAULT 0,
	"progress_total" integer DEFAULT 0,
	"summary" jsonb,
	"report" jsonb,
	"error" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_import" ADD CONSTRAINT "base_import_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;