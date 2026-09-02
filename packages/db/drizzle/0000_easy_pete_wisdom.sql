CREATE TYPE "public"."job_level" AS ENUM('intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('ashby', 'greenhouse', 'lever');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('remote', 'hybrid', 'onsite');--> statement-breakpoint
CREATE TABLE "job_snapshots" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"raw" jsonb NOT NULL,
	"changed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"source" "job_source" NOT NULL,
	"company" varchar(255) NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text NOT NULL,
	"locations" jsonb NOT NULL,
	"work_modes" "work_mode"[] DEFAULT '{}' NOT NULL,
	"level" "job_level" NOT NULL,
	"compensation" jsonb,
	"technologies" text[] DEFAULT '{}' NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"raw" jsonb NOT NULL,
	"content_hash" varchar(128) DEFAULT '' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_changed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"source" "job_source" NOT NULL,
	"board" varchar(255) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"closed_count" integer DEFAULT 0 NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "job_snapshots_job_fetched_idx" ON "job_snapshots" USING btree ("job_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_external_unique" ON "jobs" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "jobs_location_idx" ON "jobs" USING btree ("company","title");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_runs_source_board_idx" ON "sync_runs" USING btree ("source","board");