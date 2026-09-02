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
