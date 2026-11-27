DROP INDEX "case_number_portfolio_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "case_number_uq" ON "case" USING btree ("number") WHERE "case"."deleted_at" is null;