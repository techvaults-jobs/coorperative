CREATE TYPE "public"."payroll_item_kind" AS ENUM('loan', 'savings', 'shares');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'issued', 'reconciled', 'submitted', 'posted');--> statement-breakpoint
CREATE TABLE "member_contributions" (
	"society_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_contributions_member_id_product_id_pk" PRIMARY KEY("member_id","product_id"),
	CONSTRAINT "member_contributions_amount" CHECK ("member_contributions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" "payroll_item_kind" NOT NULL,
	"product_id" uuid NOT NULL,
	"loan_id" uuid,
	"scheduled" bigint NOT NULL,
	"allocated" bigint,
	CONSTRAINT "payroll_items_scheduled" CHECK ("payroll_items"."scheduled" > 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_remittance_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"amount" bigint NOT NULL,
	"member_id" uuid
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"strategy" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_at" timestamp with time zone,
	"received_on" date,
	"submission_id" uuid,
	CONSTRAINT "payroll_runs_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "payroll_runs_period" CHECK ("payroll_runs"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "member_contributions" ADD CONSTRAINT "member_contributions_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_contributions" ADD CONSTRAINT "member_contributions_society_id_product_id_products_society_id_id_fk" FOREIGN KEY ("society_id","product_id") REFERENCES "public"."products"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_society_id_run_id_payroll_runs_society_id_id_fk" FOREIGN KEY ("society_id","run_id") REFERENCES "public"."payroll_runs"("society_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_society_id_product_id_products_society_id_id_fk" FOREIGN KEY ("society_id","product_id") REFERENCES "public"."products"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_society_id_loan_id_loans_society_id_id_fk" FOREIGN KEY ("society_id","loan_id") REFERENCES "public"."loans"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_remittance_lines" ADD CONSTRAINT "payroll_remittance_lines_society_id_run_id_payroll_runs_society_id_id_fk" FOREIGN KEY ("society_id","run_id") REFERENCES "public"."payroll_runs"("society_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_remittance_lines" ADD CONSTRAINT "payroll_remittance_lines_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_society_id_submission_id_journal_submissions_society_id_id_fk" FOREIGN KEY ("society_id","submission_id") REFERENCES "public"."journal_submissions"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_items_run" ON "payroll_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "payroll_remittance_lines_run" ON "payroll_remittance_lines" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_society_period" ON "payroll_runs" USING btree ("society_id","period");