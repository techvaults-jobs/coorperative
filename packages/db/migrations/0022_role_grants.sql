CREATE TABLE "role_grant_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"invitation_id" uuid,
	"user_id" uuid,
	"roles" text[] NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	CONSTRAINT "role_grant_requests_target" CHECK (("role_grant_requests"."invitation_id" is null) <> ("role_grant_requests"."user_id" is null)),
	CONSTRAINT "role_grant_requests_status" CHECK ("role_grant_requests"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "role_grant_requests_separation" CHECK ("role_grant_requests"."decided_by" is null or ("role_grant_requests"."decided_by" <> "role_grant_requests"."requested_by" and "role_grant_requests"."decided_by" is distinct from "role_grant_requests"."user_id"))
);
--> statement-breakpoint
ALTER TABLE "officer_invitations" ADD COLUMN "needs_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "role_grant_requests" ADD CONSTRAINT "role_grant_requests_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grant_requests" ADD CONSTRAINT "role_grant_requests_invitation_id_officer_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."officer_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grant_requests" ADD CONSTRAINT "role_grant_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grant_requests" ADD CONSTRAINT "role_grant_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grant_requests" ADD CONSTRAINT "role_grant_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_grant_requests_society" ON "role_grant_requests" USING btree ("society_id","status");