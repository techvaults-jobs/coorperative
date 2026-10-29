CREATE TYPE "public"."interest_run_status" AS ENUM('submitted', 'posted', 'abandoned');--> statement-breakpoint
CREATE TABLE "interest_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"loan_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"balance" bigint NOT NULL,
	"annual_rate_bps" integer NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "interest_charges_amount" CHECK ("interest_charges"."amount" > 0 and "interest_charges"."balance" > 0)
);
--> statement-breakpoint
CREATE TABLE "interest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"period" text NOT NULL,
	"charge_date" date NOT NULL,
	"status" "interest_run_status" DEFAULT 'submitted' NOT NULL,
	"total" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid NOT NULL,
	CONSTRAINT "interest_runs_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "interest_runs_period" CHECK ("interest_runs"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "interest_runs_total" CHECK ("interest_runs"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "interest_charges" ADD CONSTRAINT "interest_charges_society_id_run_id_interest_runs_society_id_id_fk" FOREIGN KEY ("society_id","run_id") REFERENCES "public"."interest_runs"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_charges" ADD CONSTRAINT "interest_charges_society_id_loan_id_loans_society_id_id_fk" FOREIGN KEY ("society_id","loan_id") REFERENCES "public"."loans"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_charges" ADD CONSTRAINT "interest_charges_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_runs" ADD CONSTRAINT "interest_runs_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_runs" ADD CONSTRAINT "interest_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_runs" ADD CONSTRAINT "interest_runs_society_id_submission_id_journal_submissions_society_id_id_fk" FOREIGN KEY ("society_id","submission_id") REFERENCES "public"."journal_submissions"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_charges_run_loan" ON "interest_charges" USING btree ("run_id","loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interest_runs_society_period" ON "interest_runs" USING btree ("society_id","period") WHERE status <> 'abandoned';