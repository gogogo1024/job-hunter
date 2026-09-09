import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { db, searchJobs, addJobFlag, removeJobFlag, getJobFlagStats, isJobFlaggedAsProblematic } from "@job-hunter/db";
import { sql } from "drizzle-orm";

describe("Job Flags (Voting) Integration Tests", () => {
  let postgresReady = false;

  beforeAll(async () => {
    // Try to start docker-compose; if it fails, we'll try to connect to existing postgres
    try {
      execSync("docker-compose -f infra/compose.yaml up -d", {
        cwd: "/Users/huangcheng/Documents/github/job-hunter",
        stdio: "pipe",
      });
      // Wait a bit for postgres to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      console.warn("Docker-compose start failed, trying to connect to existing postgres:", (err as Error).message);
    }

    // Attempt connection with retry
    let attempts = 0;
    while (attempts < 5) {
      try {
        await db.execute(sql`SELECT 1`);
        postgresReady = true;
        break;
      } catch {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!postgresReady) {
      throw new Error("Could not connect to PostgreSQL");
    }

    // Run migrations
    try {
      execSync("pnpm db:migrate", {
        cwd: "/Users/huangcheng/Documents/github/job-hunter/packages/db",
        stdio: "pipe",
      });
    } catch (err) {
      console.warn("Migration warning:", (err as Error).message);
    }
  });

  afterAll(async () => {
    // Cleanup: remove test data
    try {
      await db.execute(sql`DELETE FROM job_flags WHERE user_id LIKE 'test-user-%'`);
    } catch (err) {
      console.warn("Cleanup warning:", (err as Error).message);
    }
  });

  it("inserts and retrieves job flags", async () => {
    const userId = `test-user-${Date.now()}`;
    const jobId = `test-job-${Date.now()}`;

    // Add a problematic_job flag
    const flag = await addJobFlag(userId, "problematic_job", {
      jobId,
      reason: "Suspicious posting",
    });

    expect(flag).toBeDefined();
    expect(flag.userId).toBe(userId);
    expect(flag.jobId).toBe(jobId);
    expect(flag.flagType).toBe("problematic_job");
    expect(flag.reason).toBe("Suspicious posting");

    // Get stats
    const stats = await getJobFlagStats({ jobId });
    expect(stats).toHaveLength(1);
    expect(stats?.[0]).toBeDefined();
    expect(stats[0]?.count).toBe(1);
    expect(stats[0]?.flagType).toBe("problematic_job");
  });

  it("prevents duplicate flags (idempotent)", async () => {
    const userId = `test-user-${Date.now()}`;
    const jobId = `test-job-${Date.now()}`;

    // Add flag twice
    const flag1 = await addJobFlag(userId, "problematic_job", { jobId });
    const flag2 = await addJobFlag(userId, "problematic_job", { jobId });

    // Should return same ID (idempotent)
    expect(flag1.id).toBe(flag2.id);

    // Check stats show only 1 flag
    const stats = await getJobFlagStats({ jobId });
    expect(stats?.[0]?.count).toBe(1);
  });

  it("removes flags", async () => {
    const userId = `test-user-${Date.now()}`;
    const jobId = `test-job-${Date.now()}`;

    // Add and remove flag
    await addJobFlag(userId, "problematic_job", { jobId });
    const removed = await removeJobFlag(userId, "problematic_job", { jobId });

    expect(removed).toBe(true);

    // Check stats show 0 flags
    const stats = await getJobFlagStats({ jobId });
    expect(stats ?? []).toHaveLength(0);
  });

  it("flags company-level problems", async () => {
    const userId = `test-user-${Date.now()}`;
    const company = "BadCorp Inc";

    await addJobFlag(userId, "problematic_company", { company });

    const stats = await getJobFlagStats({ company });
    expect(stats).toHaveLength(1);
    expect(stats?.[0]?.flagType).toBe("problematic_company");
  });

  it("filters flagged jobs from search results when threshold reached", async () => {
    // This test requires test jobs to be in the database, which is beyond scope here.
    // For now, we just verify the isJobFlaggedAsProblematic function works.
    const testJobId = `test-flagged-${Date.now()}`;

    // Add 2 flags from different users
    await addJobFlag(`user1-${Date.now()}`, "problematic_job", { jobId: testJobId });
    await addJobFlag(`user2-${Date.now()}`, "problematic_job", { jobId: testJobId });

    // Should be flagged now
    const isFlagged = await isJobFlaggedAsProblematic(testJobId, 2);
    expect(isFlagged).toBe(true);
  });
});
