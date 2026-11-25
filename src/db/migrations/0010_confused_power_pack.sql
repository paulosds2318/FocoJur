ALTER TABLE "task" ADD COLUMN "internal_due_date" date;--> statement-breakpoint
CREATE INDEX "task_internal_due_idx" ON "task" USING btree ("internal_due_date");