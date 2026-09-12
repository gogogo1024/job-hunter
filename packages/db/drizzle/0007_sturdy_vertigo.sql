CREATE TYPE "public"."application_status" AS ENUM('pending', 'applied', 'rejected', 'interview');--> statement-breakpoint
CREATE TABLE "company_blacklist" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_blacklist_company_name_unique" UNIQUE("company_name")
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"filter_reasons" text[] DEFAULT '{}' NOT NULL,
	"review_flags" text[] DEFAULT '{}' NOT NULL,
	"applied_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_applications_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE INDEX "company_blacklist_name_idx" ON "company_blacklist" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "job_applications_job_idx" ON "job_applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_applications_status_idx" ON "job_applications" USING btree ("status");