ALTER TABLE "task" ADD COLUMN "bucket_id" uuid;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_bucket_id_lookup_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_bucket_idx" ON "task" USING btree ("bucket_id");