CREATE TYPE "public"."withdrawal_status" AS ENUM('requested', 'approved', 'rejected', 'cancelled', 'paying', 'paid');--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text,
	"requested_on" date NOT NULL,
	"earliest_payment" date NOT NULL,
	"status" "withdrawal_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"payment_submission_id" uuid,
	CONSTRAINT "withdrawals_society_id_id" UNIQUE("society_id","id"),
	CONSTRAINT "withdrawals_amount_positive" CHECK ("withdrawals"."amount" > 0),
	CONSTRAINT "withdrawals_separation_of_duties" CHECK ("withdrawals"."status" not in ('approved', 'rejected', 'paying', 'paid') or "withdrawals"."decided_by" <> "withdrawals"."requested_by")
);
--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_society_id_member_id_members_society_id_id_fk" FOREIGN KEY ("society_id","member_id") REFERENCES "public"."members"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_society_id_product_id_products_society_id_id_fk" FOREIGN KEY ("society_id","product_id") REFERENCES "public"."products"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_society_id_payment_submission_id_journal_submissions_society_id_id_fk" FOREIGN KEY ("society_id","payment_submission_id") REFERENCES "public"."journal_submissions"("society_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "withdrawals_society_status" ON "withdrawals" USING btree ("society_id","status");