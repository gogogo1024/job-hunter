ALTER TABLE "jobs" ADD COLUMN "ai_inferred_level" "job_level";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_required_technologies" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_company_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_analysis_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_analysis_error" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_analysis_at" timestamp with time zone;