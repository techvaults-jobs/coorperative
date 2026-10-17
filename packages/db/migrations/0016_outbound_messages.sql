CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"body" text,
	"error" text,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_messages_status" CHECK ("outbound_messages"."status" in ('sent', 'logged', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "outbound_messages_created" ON "outbound_messages" USING btree ("created_at");