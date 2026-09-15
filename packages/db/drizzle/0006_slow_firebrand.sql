CREATE TYPE "public"."email_job_status" AS ENUM('queued', 'sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"title" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_job_id" varchar(255) NOT NULL,
	"provider_event_type" text,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_jobs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"dedupe_key" varchar(255),
	"recipients" text[] DEFAULT '{}' NOT NULL,
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"attachments" jsonb,
	"metadata" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" "email_job_status" DEFAULT 'queued' NOT NULL,
	"provider_id" varchar(255),
	"provider_message_id" varchar(255),
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppression" (
	"recipient" varchar(255) PRIMARY KEY NOT NULL,
	"reason" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(255) NOT NULL,
	"role" text NOT NULL,
	"type" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversations_updated_idx" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "email_events_job_idx" ON "email_events" USING btree ("email_job_id");--> statement-breakpoint
CREATE INDEX "email_jobs_status_idx" ON "email_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_jobs_next_attempt_idx" ON "email_jobs" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");