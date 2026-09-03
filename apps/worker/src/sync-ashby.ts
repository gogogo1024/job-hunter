import "dotenv/config";
import { fetchAshbyJobs } from "@job-hunter/integrations";
import { upsertJob, closeMissingJobs, createSyncRun, updateSyncRunCounts, finishSyncRun, getJobsContentHashes, hashJobContent, getJobRaw, detectSuspiciousChange } from "@job-hunter/db";
import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";

// Support single-board, comma-separated list (`ASHBY_JOB_BOARDS`), or CLI arg `all`.
const argBoard = process.argv[2];
const envBoard = process.env.ASHBY_JOB_BOARD;
const envBoards = process.env.ASHBY_JOB_BOARDS;

let boards: string[] = [];
if (argBoard) {
  if (argBoard === "all") {
    if (!envBoards) throw new Error("When using 'all' please set ASHBY_JOB_BOARDS (comma-separated)");
    boards = envBoards.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    boards = [argBoard];
  }
} else if (envBoards) {
  boards = envBoards.split(",").map((s) => s.trim()).filter(Boolean);
} else if (envBoard) {
  boards = [envBoard];
} else {
  throw new Error("Usage: pnpm --filter @job-hunter/worker sync:ashby <job-board> or set ASHBY_JOB_BOARD or ASHBY_JOB_BOARDS");
}

async function sendSuspicionEmail(apiKey: string, to: string[], runId: string, board: string, changedCount: number, ratio: number, csvPath?: string) {
  return new Promise<void>((resolve, reject) => {
    const body = {
      from: process.env.RESEND_FROM || "no-reply@job-hunter.local",
      to,
      subject: `Job Hunter: Suspicious sync ${runId}`,
      html: `<p>Sync <strong>${runId}</strong> on board <strong>${board}</strong> marked suspicious.</p><p>Predicted changed: ${changedCount}, ratio: ${ratio.toFixed(2)}</p><p>CSV: ${csvPath ?? "(not available)"}</p>`,
    };

    const req = https.request(
      {
        hostname: "api.resend.com",
        port: 443,
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(JSON.stringify(body)),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`resend status ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        });
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

for (const board of boards) {
  let runId: string | undefined;
  let _finished = false;
  try {
    const run = await createSyncRun("ashby", board);
    runId = run.id;
    // initialize counts in sync_runs
    await updateSyncRunCounts(runId, 0, 0, 0, false, 0);

    const jobs = await fetchAshbyJobs(board);
    let changed = 0;
    const seenExternalIds: string[] = [];

    // Precompute existing content hashes to decide quarantine without overwriting main rows
    const extIds = jobs.map((j) => j.externalId);
    const existingHashes = await getJobsContentHashes("ashby", board, extIds);

    // Compute new hashes and a predicted changed count before mutating DB so we can quarantine whole-run anomalies.
    const newHashes: Record<string, string> = {};
    let predictedChanged = 0;
    for (const job of jobs) {
      const newHash = hashJobContent(job);
      newHashes[job.externalId] = newHash;
      const prevHash = existingHashes[job.externalId] ?? null;
      if (!prevHash || prevHash !== newHash) predictedChanged += 1;
    }

    const total = jobs.length;
    const predictedRatio = total > 0 ? predictedChanged / total : 0;
    const isSuspicious = predictedChanged >= 20 || predictedRatio >= 0.5;
    const anomalyScore = Math.round(predictedRatio * 100);

    if (isSuspicious) {
      // Export a CSV for human review and mark fetched items as quarantined to avoid overwrites.
      try {
        const tmpDir = path.resolve(process.cwd(), "tmp");
        await fs.mkdir(tmpDir, { recursive: true });
        const csvPath = path.join(tmpDir, `quarantine-${runId}.csv`);
        const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const header = ["id", "externalId", "title", "url", "prevHash", "newHash", "locations", "technologies", "reasons", "score"].join(",") + "\n";
        const linesArr: string[] = [];
        for (const j of jobs) {
          const prev = existingHashes[j.externalId] ?? "";
          const now = newHashes[j.externalId] ?? "";
          const prevRaw = await getJobRaw("ashby", j.externalId);
          const detect = detectSuspiciousChange(prevRaw as any, j as any);
          const reasons = detect.reasons.join("|");
          const score = String(detect.score ?? 0);
          const line = [
            escape(j.id),
            escape(j.externalId),
            escape(j.title),
            escape(j.url),
            escape(prev),
            escape(now),
            escape(JSON.stringify(j.locations ?? [])),
            escape(JSON.stringify(j.technologies ?? [])),
            escape(reasons),
            escape(score),
          ].join(",");
          linesArr.push(line);
        }
        const lines = linesArr.join("\n");
        await fs.writeFile(csvPath, header + lines, "utf8");
        console.error(`Wrote quarantine CSV for review: ${csvPath}`);
        // mark all jobs as quarantined to avoid overwriting main rows during suspicious runs
        for (const job of jobs) (job as any).__quarantine = true;
        // send an email alert if configured via Resend
        const resendKey = process.env.RESEND_API_KEY;
        const alertTo = process.env.SUSPICION_ALERT_TO;
        if (resendKey && alertTo) {
          try {
            await sendSuspicionEmail(resendKey, alertTo.split(","), runId as string, board, predictedChanged, predictedRatio, csvPath);
            console.error("Sent suspicion alert via Resend.");
          } catch (e) {
            console.error("Failed to send suspicion alert:", e);
          }
        }
      } catch (err) {
        console.error("Failed to export quarantine CSV:", err);
      }
    }

    // Now perform upserts (per-job heuristics can still mark __quarantine individually)
    let processed = 0;
    const progressUpdateInterval = 10; // flush counts to DB every N jobs
    for (const job of jobs) {
      seenExternalIds.push(job.externalId);
      const perJobSuspicious = (job as any).__suspicious === true;
      if (perJobSuspicious) (job as any).__quarantine = true;

      const result = await upsertJob(job, runId);
      if (result.changed) changed += 1;

      processed += 1;
      // update incremental progress periodically so operators can observe progress
      if (processed % progressUpdateInterval === 0) {
        try {
          await updateSyncRunCounts(runId as string, processed, changed, undefined, isSuspicious, anomalyScore);
        } catch (e) {
          console.error("Failed to update sync run progress:", e);
        }
      }
    }

    // final progress update after upserts
    try {
      await updateSyncRunCounts(runId as string, processed, changed, undefined, isSuspicious, anomalyScore);
    } catch (e) {
      console.error("Failed to update final upsert counts:", e);
    }

    let closed = 0;
    if (!isSuspicious) {
      // Mark missing old jobs as closed (for this board)
      closed = await closeMissingJobs("ashby", board, seenExternalIds, new Date(), runId);
    } else {
      console.error(`Ashby sync flagged as SUSPICIOUS (predictedChanged=${predictedChanged}, total=${total}, ratio=${predictedRatio.toFixed(2)}). Skipping auto-close.`);
    }

    await updateSyncRunCounts(runId as string, jobs.length, changed, closed, isSuspicious, anomalyScore);
    await finishSyncRun(runId as string, "success");
    _finished = true;

    console.error(`Ashby sync: ${jobs.length} jobs fetched, ${changed} changed, ${closed} closed. suspicious=${isSuspicious} score=${anomalyScore}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId) {
      try {
        await finishSyncRun(runId, "failed", new Date(), msg);
      } catch (e) {
        console.error("Failed to mark sync run failed:", e);
      }
    }
    _finished = true;
    console.error(`Ashby sync failed for board ${board}: ${msg}`);
    // continue with next board rather than throw to allow batch runs
  } finally {
    if (runId && !_finished) {
      try {
        await finishSyncRun(runId, "failed", new Date(), "terminated unexpectedly");
        console.error(`Marked sync run ${runId} as failed (terminated unexpectedly).`);
      } catch (e) {
        console.error("Failed to finalize sync run in finally:", e);
      }
    }
  }
}
