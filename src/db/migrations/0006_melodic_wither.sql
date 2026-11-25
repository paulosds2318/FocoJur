ALTER TABLE "monitored_term" ADD COLUMN "search_status" text;--> statement-breakpoint
ALTER TABLE "monitored_term" ADD COLUMN "search_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitored_term" ADD COLUMN "search_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitored_term" ADD COLUMN "search_found" integer;--> statement-breakpoint
ALTER TABLE "monitored_term" ADD COLUMN "search_new" integer;--> statement-breakpoint
ALTER TABLE "monitored_term" ADD COLUMN "search_days" integer;--> statement-breakpoint
ALTER TABLE "monitored_term" ADD COLUMN "search_error" text;