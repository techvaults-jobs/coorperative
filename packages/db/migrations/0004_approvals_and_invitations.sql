CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "journal_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"lines" jsonb NOT NULL,
	"reverses_entry_id" uuid,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"prepared_by" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	CONSTRAINT "journal_submissions_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "journal_submissions_decision" CHECK (("journal_submissions"."status" = 'pending') = ("journal_submissions"."decided_by" is null))
);
--> statement-breakpoint
CREATE TABLE "officer_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"email" text NOT NULL,
	"roles" text[] NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "officer_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "officer_invitations_has_roles" CHECK (cardinality("officer_invitations"."roles") > 0)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "entry_no" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "entry_no" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_submissions" ADD CONSTRAINT "journal_submissions_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_submissions" ADD CONSTRAINT "journal_submissions_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_submissions" ADD CONSTRAINT "journal_submissions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_submissions" ADD CONSTRAINT "journal_submissions_society_id_reverses_entry_id_journal_entries_society_id_id_fk" FOREIGN KEY ("society_id","reverses_entry_id") REFERENCES "public"."journal_entries"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invitations" ADD CONSTRAINT "officer_invitations_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invitations" ADD CONSTRAINT "officer_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invitations" ADD CONSTRAINT "officer_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_invitations" ADD CONSTRAINT "officer_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_submissions_society_idempotency" ON "journal_submissions" USING btree ("society_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_submissions_pending_reversal" ON "journal_submissions" USING btree ("reverses_entry_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "journal_submissions_society_status" ON "journal_submissions" USING btree ("society_id","status");--> statement-breakpoint
CREATE INDEX "officer_invitations_society" ON "officer_invitations" USING btree ("society_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_society_entry_no" ON "journal_entries" USING btree ("society_id","entry_no");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_submission" ON "journal_entries" USING btree ("submission_id");