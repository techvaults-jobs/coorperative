CREATE TYPE "public"."account_class" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."entry_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."liability_type" AS ENUM('limited', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('applicant', 'active', 'suspended', 'exiting', 'exited', 'deceased');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"society_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "audit_events_society_id_sequence_pk" PRIMARY KEY("society_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"entry_no" bigserial NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reverses_entry_id" uuid,
	"policy_version_id" uuid,
	"prepared_by" uuid NOT NULL,
	"posted_by" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_society_id_id" UNIQUE("society_id","id")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"society_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"member_id" uuid,
	"side" "entry_side" NOT NULL,
	"amount" bigint NOT NULL,
	"memo" text,
	CONSTRAINT "journal_lines_amount_positive" CHECK ("journal_lines"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"class" "account_class" NOT NULL,
	"is_member_control" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ledger_accounts_society_id_id" UNIQUE("society_id","id")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"member_no" text NOT NULL,
	"full_name" text NOT NULL,
	"staff_id" text,
	"department" text,
	"phone" text,
	"email" text,
	"status" "member_status" DEFAULT 'applicant' NOT NULL,
	"joined_on" date,
	"coop_id" text,
	"nominee_name" text,
	"nominee_relationship" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_society_id_id" UNIQUE("society_id","id")
);
--> statement-breakpoint
CREATE TABLE "societies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"state" text NOT NULL,
	"registrar" text NOT NULL,
	"registration_number" text,
	"cvn" text,
	"liability_type" "liability_type" DEFAULT 'limited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "societies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "society_users" (
	"society_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	CONSTRAINT "society_users_society_id_user_id_pk" PRIMARY KEY("society_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"is_platform_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_society_id_reverses_entry_id_journal_entries_society_id_id_fk" FOREIGN KEY ("society_id","reverses_entry_id") REFERENCES "public"."journal_entries"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_society_id_entry_id_journal_entries_society_id_id_fk" FOREIGN KEY ("society_id","entry_id") REFERENCES "public"."journal_entries"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_society_id_account_id_ledger_accounts_society_id_id_fk" FOREIGN KEY ("society_id","account_id") REFERENCES "public"."ledger_accounts"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_users" ADD CONSTRAINT "society_users_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_users" ADD CONSTRAINT "society_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_society_idempotency" ON "journal_entries" USING btree ("society_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_reverses_once" ON "journal_entries" USING btree ("reverses_entry_id");--> statement-breakpoint
CREATE INDEX "journal_entries_society_date" ON "journal_entries" USING btree ("society_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_lines_entry" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account" ON "journal_lines" USING btree ("society_id","account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_member" ON "journal_lines" USING btree ("society_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_society_code" ON "ledger_accounts" USING btree ("society_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "members_society_member_no" ON "members" USING btree ("society_id","member_no");--> statement-breakpoint
CREATE UNIQUE INDEX "members_society_staff_id" ON "members" USING btree ("society_id","staff_id");