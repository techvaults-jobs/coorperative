CREATE TABLE "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"society" text NOT NULL,
	"role" text,
	"email" text NOT NULL,
	"phone" text,
	"sector" text,
	"members" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
