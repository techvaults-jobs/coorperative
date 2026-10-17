CREATE TYPE "public"."society_sector" AS ENUM('workplace', 'agricultural', 'transport', 'market', 'multipurpose', 'credit_union', 'housing', 'other');--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "sector" "society_sector" DEFAULT 'workplace' NOT NULL;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "short_name" text;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "financial_year_start" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "terminology" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "societies" ADD COLUMN "modules" text[];--> statement-breakpoint
ALTER TABLE "societies" ADD CONSTRAINT "societies_brand_color" CHECK ("societies"."brand_color" is null or "societies"."brand_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "societies" ADD CONSTRAINT "societies_financial_year_start" CHECK ("societies"."financial_year_start" between 1 and 12);