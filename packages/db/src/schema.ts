import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const jobSourceEnum = pgEnum("job_source", ["ashby", "greenhouse", "lever"]);
export const jobLevelEnum = pgEnum("job_level", ["intern", "junior", "mid", "senior", "staff", "principal", "unknown"]);
export const workModeEnum = pgEnum("work_mode", ["remote", "hybrid", "onsite"]);
export const jobStatusEnum = pgEnum("job_status", ["open", "closed", "quarantined"]);

export const jobs = pgTable(
  "jobs",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    source: jobSourceEnum("source").notNull(),
    company: varchar("company", { length: 255 }).notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    // Split text/html to avoid losing raw HTML and to avoid over-processing at the integrator layer
    descriptionText: text("description_text").notNull(),
    descriptionHtml: text("description_html"),
    description: text("description").notNull().default(''), // legacy compatibility column; kept populated for older queries
    locations: jsonb("locations").notNull().$type<unknown[]>(),
    workModes: workModeEnum("work_modes").array().notNull().default([]),
    level: jobLevelEnum("level").notNull(),
    compensation: jsonb("compensation").$type<unknown>(),
    technologies: text("technologies").array().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    status: jobStatusEnum("status").notNull().default("open"),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    contentHash: varchar("content_hash", { length: 128 }).notNull().default(""),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jobs_source_external_unique").on(table.source, table.externalId),
    index("jobs_location_idx").on(table.company, table.title),
    index("jobs_status_idx").on(table.status),
  ],
);

export const jobSnapshots = pgTable(
  "job_snapshots",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    jobId: varchar("job_id", { length: 255 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    changed: boolean("changed").notNull(),
    // Associate a snapshot to the sync run that produced it (nullable)
    syncRunId: varchar("sync_run_id", { length: 255 }),
  },
  (table) => [
    index("job_snapshots_job_fetched_idx").on(table.jobId, table.fetchedAt),
  ],
);

export const syncStatusEnum = pgEnum("sync_status", ["pending", "running", "success", "failed"]);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    source: jobSourceEnum("source").notNull(),
    board: varchar("board", { length: 255 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    fetchedCount: integer("fetched_count").notNull().default(0),
    changedCount: integer("changed_count").notNull().default(0),
    closedCount: integer("closed_count").notNull().default(0),
    // anomaly detection fields
    isSuspicious: boolean("is_suspicious").notNull().default(false),
    anomalyScore: integer("anomaly_score").notNull().default(0),
    status: syncStatusEnum("status").notNull().default("pending"),
    error: text("error"),
  },
  (table) => [
    index("sync_runs_source_board_idx").on(table.source, table.board),
  ],
);

export const jobSnapshotDiffs = pgTable(
  "job_snapshot_diffs",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    jobSnapshotId: varchar("job_snapshot_id", { length: 255 }).notNull(),
    jobId: varchar("job_id", { length: 255 }).notNull(),
    diff: jsonb("diff").notNull().$type<Record<string, unknown>>(),
    // Optional link back to the sync run that produced this diff
    syncRunId: varchar("sync_run_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("job_snapshot_diffs_job_idx").on(table.jobId),
  ],
);

export const quarantineReviews = pgTable(
  "quarantine_reviews",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    jobId: varchar("job_id", { length: 255 }).notNull(),
    jobSnapshotId: varchar("job_snapshot_id", { length: 255 }),
    action: text("action").notNull(),
    reviewer: varchar("reviewer", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("quarantine_reviews_job_idx").on(table.jobId),
  ],
);

export const emailJobStatus = pgEnum("email_job_status", ["queued", "sent", "failed", "suppressed"]);

export const emailJobs = pgTable(
  "email_jobs",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    dedupeKey: varchar("dedupe_key", { length: 255 }),
    recipients: text("recipients").array().notNull().default([]),
    subject: text("subject").notNull(),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    attachments: jsonb("attachments").$type<unknown[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    status: emailJobStatus("status").notNull().default("queued"),
    providerId: varchar("provider_id", { length: 255 }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_jobs_status_idx").on(table.status),
    index("email_jobs_next_attempt_idx").on(table.nextAttemptAt),
  ],
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    emailJobId: varchar("email_job_id", { length: 255 }).notNull(),
    providerEventType: text("provider_event_type"),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_events_job_idx").on(table.emailJobId)],
);

export const emailSuppression = pgTable(
  "email_suppression",
  {
    recipient: varchar("recipient", { length: 255 }).primaryKey(),
    reason: text("reason"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [],
);

// Conversations & messages: persistent audit of chat interactions (chat-as-search)
export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }),
    title: text("title"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversations_updated_idx").on(table.updatedAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 255 }).notNull(),
    role: text("role").notNull(), // 'user' | 'system' | 'job-card' | 'action'
    type: text("type"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);
