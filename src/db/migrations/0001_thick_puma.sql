CREATE TABLE "lookup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"portfolio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_civil" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid,
	"subject_id" uuid,
	"subject_secondary_id" uuid,
	"reservation_origin_id" uuid,
	"contract_signed" boolean,
	"rental_type_id" uuid,
	"avoidable" boolean,
	"root_cause" text,
	"root_cause_area" text,
	"negative_404_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_labor" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"job_role_id" uuid,
	"dismissal_type_id" uuid,
	"admission_month" text,
	"dismissal_month" text,
	"claims" text,
	"region" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_party" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"lawyer_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_procon" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"kind" text,
	"agency" text,
	"tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_risk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"prognosis" text,
	"risk_total" numeric(14, 2),
	"risk_material" numeric(14, 2),
	"risk_moral" numeric(14, 2),
	"claim_value" numeric(14, 2),
	"settlement_limit" numeric(14, 2),
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"portfolio" text NOT NULL,
	"polarity" text DEFAULT 'passive' NOT NULL,
	"system_id" uuid,
	"court_type_id" uuid,
	"state" text,
	"city" text,
	"court" text,
	"status_id" uuid,
	"contingency_status_id" uuid,
	"owner_id" text,
	"external_firm" text,
	"received_at" date,
	"cited_at" date,
	"fact_date" date,
	"closed_at" date,
	"closing_reason_id" uuid,
	"cost_center" text,
	"details" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"monitoring" boolean DEFAULT true NOT NULL,
	"last_movement_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"contract_code" text NOT NULL,
	"store" text,
	"plate" text,
	"vehicle_model" text,
	"rental_type" text,
	"app_driver" boolean,
	"source" text DEFAULT 'manual' NOT NULL,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadline_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"act_type" text NOT NULL,
	"days" integer,
	"day_count" text,
	"due_date" date,
	"legal_basis" text,
	"confidence" numeric(4, 3),
	"ai_call_id" uuid,
	"decision" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"final_due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"source" text NOT NULL,
	"external_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"title" text,
	"raw_text" text,
	"ai_summary" text,
	"triage_status" text DEFAULT 'pending' NOT NULL,
	"discard_reason" text,
	"matched_term_id" uuid,
	"read_by" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holiday" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"scope" text NOT NULL,
	"state" text,
	"city" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"movement_id" uuid,
	"type_id" uuid,
	"title" text NOT NULL,
	"due_date" date,
	"due_time" time,
	"owner_id" text,
	"reviewer_id" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" date,
	"sens_ticket" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items_found" integer DEFAULT 0,
	"items_new" integer DEFAULT 0,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_key" text,
	"source" text DEFAULT 'projuris_export' NOT NULL,
	"uploaded_by" text,
	"rows_total" integer DEFAULT 0,
	"rows_new" integer DEFAULT 0,
	"rows_duplicate" integer DEFAULT 0,
	"rows_error" integer DEFAULT 0,
	"report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"import_batch_id" uuid,
	"external_id" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"case_number" text,
	"parsed" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"duplicate_of" uuid,
	"reviewed_by" text,
	"case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"kind" text NOT NULL,
	"document" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_fetch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" text NOT NULL,
	"portal" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"html_key" text,
	"screenshot_key" text,
	"extracted" jsonb,
	"ai_call_id" uuid,
	"fields_filled" integer,
	"navigation" text DEFAULT 'script',
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget" (
	"month" text PRIMARY KEY NOT NULL,
	"limit_brl" numeric(14, 2) NOT NULL,
	"alert_80_sent_at" timestamp with time zone,
	"alert_100_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"provider" text,
	"user_id" text,
	"case_id" uuid,
	"generation_id" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cached_tokens" integer,
	"reasoning_tokens" integer,
	"cost_usd" numeric(14, 6),
	"fx_rate" numeric(10, 4),
	"cost_brl" numeric(14, 6),
	"latency_ms" integer,
	"status" text NOT NULL,
	"error" text,
	"accepted" boolean,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_catalog" (
	"model_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prompt_price_usd" numeric(20, 12),
	"completion_price_usd" numeric(20, 12),
	"context_length" integer,
	"data_policy_ok" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_config" (
	"task" text PRIMARY KEY NOT NULL,
	"primary_model" text,
	"fallback_model" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_config_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"source" text NOT NULL,
	"rate" numeric(10, 4) NOT NULL,
	"set_by" text
);
--> statement-breakpoint
ALTER TABLE "case_civil" ADD CONSTRAINT "case_civil_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_civil" ADD CONSTRAINT "case_civil_claim_id_lookup_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_civil" ADD CONSTRAINT "case_civil_subject_id_lookup_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_civil" ADD CONSTRAINT "case_civil_subject_secondary_id_lookup_id_fk" FOREIGN KEY ("subject_secondary_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_civil" ADD CONSTRAINT "case_civil_reservation_origin_id_lookup_id_fk" FOREIGN KEY ("reservation_origin_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_civil" ADD CONSTRAINT "case_civil_rental_type_id_lookup_id_fk" FOREIGN KEY ("rental_type_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_labor" ADD CONSTRAINT "case_labor_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_labor" ADD CONSTRAINT "case_labor_job_role_id_lookup_id_fk" FOREIGN KEY ("job_role_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_labor" ADD CONSTRAINT "case_labor_dismissal_type_id_lookup_id_fk" FOREIGN KEY ("dismissal_type_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_party" ADD CONSTRAINT "case_party_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_procon" ADD CONSTRAINT "case_procon_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_risk" ADD CONSTRAINT "case_risk_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_risk" ADD CONSTRAINT "case_risk_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_system_id_lookup_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_court_type_id_lookup_id_fk" FOREIGN KEY ("court_type_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_status_id_lookup_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_contingency_status_id_lookup_id_fk" FOREIGN KEY ("contingency_status_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_closing_reason_id_lookup_id_fk" FOREIGN KEY ("closing_reason_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_link" ADD CONSTRAINT "rental_link_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_suggestion" ADD CONSTRAINT "deadline_suggestion_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_suggestion" ADD CONSTRAINT "deadline_suggestion_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_read_by_user_id_fk" FOREIGN KEY ("read_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_type_id_lookup_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."lookup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_duplicate_of_case_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_config" ADD CONSTRAINT "ai_task_config_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_config_history" ADD CONSTRAINT "ai_task_config_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_set_by_user_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lookup_type_idx" ON "lookup" USING btree ("type","code");--> statement-breakpoint
CREATE INDEX "case_party_case_idx" ON "case_party" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_risk_case_idx" ON "case_risk" USING btree ("case_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "case_number_portfolio_uq" ON "case" USING btree ("number","portfolio");--> statement-breakpoint
CREATE INDEX "case_number_idx" ON "case" USING btree ("number");--> statement-breakpoint
CREATE INDEX "case_status_idx" ON "case" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "case_owner_idx" ON "case" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "rental_link_case_idx" ON "rental_link" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "rental_link_contract_idx" ON "rental_link" USING btree ("contract_code");--> statement-breakpoint
CREATE INDEX "rental_link_plate_idx" ON "rental_link" USING btree ("plate");--> statement-breakpoint
CREATE INDEX "movement_case_idx" ON "movement" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "movement_external_idx" ON "movement" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "task_due_idx" ON "task" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "task_owner_idx" ON "task" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "task_case_idx" ON "task" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "financial_case_idx" ON "financial_entry" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "inbox_number_idx" ON "inbox_item" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "inbox_status_idx" ON "inbox_item" USING btree ("status");--> statement-breakpoint
CREATE INDEX "portal_fetch_number_idx" ON "portal_fetch" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "ai_call_at_idx" ON "ai_call" USING btree ("at");