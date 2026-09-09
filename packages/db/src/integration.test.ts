import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const COMPOSE_PATH = path.resolve(process.cwd(), "..", "..", "infra", "compose.yaml");

function runCmd(cmd: string) {
  return execSync(cmd, { stdio: "inherit" });
}

describe("integration: db fragments (docker)", () => {
  let sql: any;
  let db: any;

  beforeAll(async () => {
    // Start postgres via docker compose (infra/compose.yaml) if possible.
    // If starting the compose stack fails (already running or ports in use),
    // continue and probe the existing DB — do not fail immediately.
    let composeStarted = false;
    try {
      try {
        runCmd(`docker compose -f "${COMPOSE_PATH}" up -d`);
        composeStarted = true;
      } catch (err) {
        try {
          runCmd(`docker-compose -f "${COMPOSE_PATH}" up -d`);
          composeStarted = true;
        } catch (err2) {
          // eslint-disable-next-line no-console
          console.warn("docker compose up failed, will probe existing Postgres:", err2);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("docker compose up unexpected error, proceeding to probe DB:", err);
    }

    // Ensure DATABASE_URL points to local compose postgres
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://job_hunter:job_hunter@localhost:5432/job_hunter";

    // Import client after DATABASE_URL is set
    const client = await import("./client.js");
    sql = client.sql;
    db = client.db;

    // Wait until Postgres accepts connections
    const maxAttempts = 30;
    let ok = false;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // simple probe
        // eslint-disable-next-line no-await-in-loop
        await sql`SELECT 1`;
        ok = true;
        break;
      } catch (e) {
        // wait 1s
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!ok) throw new Error("Postgres did not become ready in time");

    // Create a minimal `email_jobs` table used by the fragments under test.
    await sql`
      CREATE TABLE IF NOT EXISTS email_jobs (
        id varchar(255) PRIMARY KEY,
        recipients text[] NOT NULL DEFAULT '{}',
        attempts integer NOT NULL DEFAULT 0
      );
    `;

    // Clean and seed
    await sql`TRUNCATE TABLE email_jobs;`;
    await sql`INSERT INTO email_jobs (id, recipients, attempts) VALUES ('e1', ARRAY['alpha@example.com','beta@example.com']::text[], 0);`;
  }, 5 * 60 * 1000);

  afterAll(async () => {
    try {
      try {
        runCmd(`docker compose -f "${COMPOSE_PATH}" down -v`);
      } catch (err) {
        runCmd(`docker-compose -f "${COMPOSE_PATH}" down -v`);
      }
    } catch (err) {
      // ignore
    }
  });

  it("increments attempts using fragments and updates matching recipient", async () => {
    const { recipientsContains, incrementAttemptsExpr } = await import("./sql-fragments.js");
    const { emailJobs } = await import("./schema.js");

    // perform the update via Drizzle using the fragments
    await db.update(emailJobs).set({ attempts: incrementAttemptsExpr() }).where(recipientsContains("alpha@example.com"));

    const rows = await sql`SELECT attempts FROM email_jobs WHERE id = 'e1'`;
    // postgres-js returns an array-like result; the first row's attempts should be 1
    // Support both object or array shapes
    const first = rows[0] as any;
    const attempts = first?.attempts ?? (Array.isArray(first) ? first[0] : undefined);
    expect(Number(attempts)).toBe(1);
  });
});
