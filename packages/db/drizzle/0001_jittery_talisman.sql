CREATE TABLE "job_snapshot_diffs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"job_snapshot_id" varchar(255) NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"diff" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "is_suspicious" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "anomaly_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "job_snapshot_diffs_job_idx" ON "job_snapshot_diffs" USING btree ("job_id");