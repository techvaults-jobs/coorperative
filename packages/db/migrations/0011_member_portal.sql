ALTER TABLE "officer_invitations" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "society_users" ADD COLUMN "member_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "society_users_member" ON "society_users" USING btree ("society_id","member_id");