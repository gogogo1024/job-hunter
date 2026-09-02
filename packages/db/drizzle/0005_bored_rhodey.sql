ALTER TABLE "job_snapshot_diffs" ADD COLUMN "sync_run_id" varchar(255);--> statement-breakpoint
ALTER TABLE "job_snapshots" ADD COLUMN "sync_run_id" varchar(255);