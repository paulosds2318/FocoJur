CREATE TABLE "risk_formula_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formula" text NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_formula_version" ADD CONSTRAINT "risk_formula_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risk_formula_version_from_idx" ON "risk_formula_version" USING btree ("effective_from");
--> statement-breakpoint
INSERT INTO "risk_formula_version" ("formula", "effective_from")
SELECT "value", '2000-01-01'::date FROM "app_setting" WHERE "key" = 'risk_formula';
