-- Create job_flag_type enum
CREATE TYPE IF NOT EXISTS "job_flag_type" AS ENUM ('problematic_job', 'problematic_company', 'spam', 'duplicate');

-- job_flags: User voting/flagging for problematic jobs or companies
CREATE TABLE IF NOT EXISTS "job_flags" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "user_id" varchar(255) NOT NULL,
    "job_id" varchar(255),
    "company" varchar(255),
    "flag_type" "job_flag_type" NOT NULL,
    "reason" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "job_flags_job_idx" ON "job_flags" ("job_id");
CREATE INDEX IF NOT EXISTS "job_flags_company_idx" ON "job_flags" ("company");
CREATE INDEX IF NOT EXISTS "job_flags_user_job_idx" ON "job_flags" ("user_id", "job_id");
CREATE INDEX IF NOT EXISTS "job_flags_type_idx" ON "job_flags" ("flag_type");
