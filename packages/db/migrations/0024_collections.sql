CREATE TYPE "public"."collection_kind" AS ENUM('savings', 'shares', 'loan', 'interest');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('draft', 'submitted', 'posted');--> statement-breakpoint
CREATE TABLE "collection_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" "collection_kind" NOT NULL,
	"product_id" uuid NOT NULL,
	"loan_id" uuid,
	"amount" bigint NOT NULL,
	CONSTRAINT "collection_lines_amount" CHECK ("collection_lines"."amount" > 0),
	CONSTRAINT "collection_lines_loan" CHECK (("collection_lines"."kind" in ('loan', 'interest')) = ("collection_lines"."loan_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "collection_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"meeting_date" date NOT NULL,
	"status" "collection_status" DEFAULT 'draft' NOT NULL,
	"cash_counted" bigint,
	"transfers" bigint,
	"bank_account_id" uuid,
	"lodgement_ref" text,
	"difference_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid,
	CONSTRAINT "collection_sheets_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "collection_sheets_cash" CHECK ("collection_sheets"."cash_counted" is null or "collection_sheets"."cash_counted" >= 0),
	CONSTRAINT "collection_sheets_transfers" CHECK ("collection_sheets"."transfers" is null or "collection_sheets"."transfers" >= 0)
);
--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "meeting_weekday" integer;--> statement-breakpoint
ALTER TABLE "collection_lines" ADD CONSTRAINT "collection_lines_society_id_sheet_id_collection_sheets_society_id_id_fk" FOREIGN KEY ("society_id","sheet_id") REFERENCES "public"."collection_sheets"("society_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_lines" ADD CONSTRAINT "collection_lines_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_lines" ADD CONSTRAINT "collection_lines_society_id_product_id_products_society_id_id_fk" FOREIGN KEY ("society_id","product_id") REFERENCES "public"."products"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_lines" ADD CONSTRAINT "collection_lines_society_id_loan_id_loans_society_id_id_fk" FOREIGN KEY ("society_id","loan_id") REFERENCES "public"."loans"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_sheets" ADD CONSTRAINT "collection_sheets_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_sheets" ADD CONSTRAINT "collection_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_sheets" ADD CONSTRAINT "collection_sheets_society_id_bank_account_id_ledger_accounts_society_id_id_fk" FOREIGN KEY ("society_id","bank_account_id") REFERENCES "public"."ledger_accounts"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_sheets" ADD CONSTRAINT "collection_sheets_society_id_submission_id_journal_submissions_society_id_id_fk" FOREIGN KEY ("society_id","submission_id") REFERENCES "public"."journal_submissions"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_lines_sheet" ON "collection_lines" USING btree ("sheet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_sheets_society_date" ON "collection_sheets" USING btree ("society_id","meeting_date");--> statement-breakpoint
ALTER TABLE "societies" ADD CONSTRAINT "societies_meeting_weekday" CHECK ("societies"."meeting_weekday" is null or "societies"."meeting_weekday" between 0 and 6);