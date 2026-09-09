import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const COMPOSE_PATH = path.resolve(process.cwd(), "..", "..", "infra", "compose.yaml");

function runCmd(cmd: string) {
  return execSync(cmd, { stdio: "inherit" });
}

describe("integration: conversations/messages (docker)", () => {
  let sql: any;

  beforeAll(async () => {
    // Start postgres via docker compose if available; otherwise probe existing DB.
    try {
      try {
        runCmd(`docker compose -f "${COMPOSE_PATH}" up -d`);
      } catch (err) {
        try {
          runCmd(`docker-compose -f "${COMPOSE_PATH}" up -d`);
        } catch (err2) {
          // eslint-disable-next-line no-console
          console.warn('docker compose up failed, will attempt to use existing Postgres:', err2);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('docker compose up unexpected error, proceeding to probe DB:', err);
    }

    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://job_hunter:job_hunter@localhost:5432/job_hunter";
    const client = await import("./client.js");
    sql = client.sql;

    // wait for postgres
    const maxAttempts = 30;
    let ok = false;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sql`SELECT 1`;
        ok = true;
        break;
      } catch (e) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!ok) throw new Error("Postgres did not become ready in time");

    // create tables (idempotent for test env)
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id varchar(255) PRIMARY KEY,
        user_id varchar(255),
        title text,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id varchar(255) PRIMARY KEY,
        conversation_id varchar(255) NOT NULL,
        role text NOT NULL,
        type text,
        content jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;

    await sql`TRUNCATE TABLE messages, conversations;`;

    await sql`INSERT INTO conversations (id, user_id, title, meta) VALUES ('c1','u1','test', ${JSON.stringify({ source: 'test' })}::jsonb);`;
    await sql`INSERT INTO messages (id, conversation_id, role, type, content) VALUES ('m1','c1','user','query', ${JSON.stringify({ text: '找远程 Go 高级，年薪 >= 300000' })}::jsonb);`;
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

  it("inserts and reads conversation/message rows", async () => {
    const rows = await sql`SELECT id, content FROM messages WHERE conversation_id = 'c1' ORDER BY created_at`;
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0] as any;
    const content = first?.content ?? null;
    expect(content).toBeTruthy();
    expect(content.text).toBe('找远程 Go 高级，年薪 >= 300000');
  });
});
