CREATE TABLE "quarantine_reviews" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"job_snapshot_id" varchar(255),
	"action" text NOT NULL,
	"reviewer" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "quarantine_reviews_job_idx" ON "quarantine_reviews" USING btree ("job_id");