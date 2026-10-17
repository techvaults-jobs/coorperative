CREATE TYPE "public"."loan_status" AS ENUM('applied', 'approved', 'rejected', 'withdrawn', 'disbursing', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('savings', 'shares', 'loan');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('proposed', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "loan_guarantors" (
	"society_id" uuid NOT NULL,
	"loan_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "loan_guarantors_loan_id_member_id_pk" PRIMARY KEY("loan_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"loan_no" integer NOT NULL,
	"member_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"term_months" integer NOT NULL,
	"purpose" text NOT NULL,
	"policy" jsonb NOT NULL,
	"policy_version" integer NOT NULL,
	"status" "loan_status" DEFAULT 'applied' NOT NULL,
	"applied_by" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"disbursement_submission_id" uuid,
	"disbursed_on" date,
	"first_due_date" date,
	"closed_at" timestamp with time zone,
	CONSTRAINT "loans_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "loans_amount_positive" CHECK ("loans"."amount" > 0),
	CONSTRAINT "loans_term" CHECK ("loans"."term_months" between 1 and 120),
	CONSTRAINT "loans_separation_of_duties" CHECK ("loans"."decided_by" is null or "loans"."status" = 'withdrawn' or "loans"."decided_by" <> "loans"."applied_by")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"kind" "product_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"account_id" uuid NOT NULL,
	"income_account_id" uuid,
	"status" "product_status" DEFAULT 'proposed' NOT NULL,
	"policy" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"proposed_policy" jsonb,
	"proposed_by" uuid,
	"proposed_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "products_active_has_policy" CHECK ("products"."status" = 'proposed' or "products"."policy" is not null),
	CONSTRAINT "products_separation_of_duties" CHECK ("products"."approved_by" is null or "products"."proposed_by" is null or "products"."approved_by" <> "products"."proposed_by")
);
--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "loan_id" uuid;--> statement-breakpoint
ALTER TABLE "loan_guarantors" ADD CONSTRAINT "loan_guarantors_society_id_loan_id_loans_society_id_id_fk" FOREIGN KEY ("society_id","loan_id") REFERENCES "public"."loans"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_guarantors" ADD CONSTRAINT "loan_guarantors_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_society_id_product_id_products_society_id_id_fk" FOREIGN KEY ("society_id","product_id") REFERENCES "public"."products"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_society_id_disbursement_submission_id_journal_submissions_society_id_id_fk" FOREIGN KEY ("society_id","disbursement_submission_id") REFERENCES "public"."journal_submissions"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_society_id_account_id_ledger_accounts_society_id_id_fk" FOREIGN KEY ("society_id","account_id") REFERENCES "public"."ledger_accounts"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_society_id_income_account_id_ledger_accounts_society_id_id_fk" FOREIGN KEY ("society_id","income_account_id") REFERENCES "public"."ledger_accounts"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loans_society_loan_no" ON "loans" USING btree ("society_id","loan_no");--> statement-breakpoint
CREATE INDEX "loans_society_status" ON "loans" USING btree ("society_id","status");--> statement-breakpoint
CREATE INDEX "loans_member" ON "loans" USING btree ("society_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_society_code" ON "products" USING btree ("society_id","code");--> statement-breakpoint
CREATE INDEX "journal_lines_loan" ON "journal_lines" USING btree ("loan_id");