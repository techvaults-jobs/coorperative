CREATE TABLE "financial_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'closing' NOT NULL,
	"surplus" bigint NOT NULL,
	"statutory_reserve" bigint NOT NULL,
	"submission_id" uuid,
	"closed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_years_status" CHECK ("financial_years"."status" in ('closing', 'closed', 'abandoned'))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_submissions" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_society_id_submission_id_journal_submissions_society_id_id_fk" FOREIGN KEY ("society_id","submission_id") REFERENCES "public"."journal_submissions"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_years_society_end" ON "financial_years" USING btree ("society_id","end_date");