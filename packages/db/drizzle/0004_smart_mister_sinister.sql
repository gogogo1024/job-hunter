ALTER TABLE "jobs" ALTER COLUMN "description" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "description_text" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "description_html" text;