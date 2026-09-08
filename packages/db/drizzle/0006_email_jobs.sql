-- Create email job tables for notifications subsystem

CREATE TYPE email_job_status AS ENUM ('queued','sent','failed','suppressed');

CREATE TABLE email_jobs (
  id varchar(255) PRIMARY KEY,
  dedupe_key varchar(255),
  recipients text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  body_text text,
  body_html text,
  attachments jsonb,
  metadata jsonb,
  attempts integer NOT NULL DEFAULT 0,
  status email_job_status NOT NULL DEFAULT 'queued',
  provider_id varchar(255),
  provider_message_id varchar(255),
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_jobs_status_idx ON email_jobs (status);
CREATE INDEX email_jobs_next_attempt_idx ON email_jobs (next_attempt_at);
CREATE INDEX email_jobs_dedupe_idx ON email_jobs (dedupe_key);

CREATE TABLE email_events (
  id varchar(255) PRIMARY KEY,
  email_job_id varchar(255) REFERENCES email_jobs(id) ON DELETE CASCADE,
  provider_event_type text,
  provider_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_suppression (
  recipient varchar(255) PRIMARY KEY,
  reason text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);
