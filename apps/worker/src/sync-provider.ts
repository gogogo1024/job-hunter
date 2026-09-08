import fs from "node:fs/promises";
import path from "node:path";
import { enqueueEmail } from "@job-hunter/notifications";
import type { Job } from "@job-hunter/shared";
import type { JobProvider } from "@job-hunter/integrations";
import {
  upsertJob,
  closeMissingJobs,
  createSyncRun,
  updateSyncRunCounts,
  finishSyncRun,
  getJobsContentHashes,
  hashJobContent,
  getJobRaw,
  detectSuspiciousChange,
} from "@job-hunter/db";

// Use enqueueEmail from notifications package to decouple sending from sync logic

export async function syncProvider(providerFactory: (board: string) => JobProvider, source: string, boards: string[]) {
  for (const board of boards) {
    let runId: string | undefined;
    let _finished = false;
    try {
      const run = await createSyncRun(source as any, board);
      runId = run.id;
      // initialize counts in sync_runs
      await updateSyncRunCounts(runId, 0, 0, 0, false, 0);

      const provider = providerFactory(board);
      const jobs = await provider.fetchJobs();
      let changed = 0;
      const seenExternalIds: string[] = [];

      // Precompute existing content hashes to decide quarantine without overwriting main rows
      const extIds = jobs.map((j) => (j as any).externalId);
      const existingHashes = await getJobsContentHashes(source as any, board, extIds);

      // Compute new hashes and a predicted changed count before mutating DB so we can quarantine whole-run anomalies.
      const newHashes: Record<string, string> = {};
      let predictedChanged = 0;
      for (const job of jobs) {
        const newHash = hashJobContent(job as any);
        newHashes[(job as any).externalId] = newHash;
        const prevHash = existingHashes[(job as any).externalId] ?? null;
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
            const prev = existingHashes[(j as any).externalId] ?? "";
            const now = newHashes[(j as any).externalId] ?? "";
            const prevRaw = await getJobRaw(source as any, (j as any).externalId);
            const detect = detectSuspiciousChange(prevRaw as any, j as any);
            const reasons = detect.reasons.join("|");
            const score = String(detect.score ?? 0);
            const line = [
              escape((j as any).id),
              escape((j as any).externalId),
              escape((j as any).title),
              escape((j as any).url),
              escape(prev),
              escape(now),
              escape(JSON.stringify((j as any).locations ?? [])),
              escape(JSON.stringify((j as any).technologies ?? [])),
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
          // enqueue a notification email if configured
          const alertTo = process.env.SUSPICION_ALERT_TO;
          if (alertTo) {
            try {
              const notifyList = alertTo.split(",").map((s) => s.trim()).filter(Boolean);
              if (notifyList.length) {
                const csvBuf = await fs.readFile(csvPath);
                const attachments = [
                  { filename: path.basename(csvPath), content: csvBuf.toString("base64"), contentType: "text/csv" },
                ];
                await enqueueEmail({
                  to: notifyList,
                  subject: `Job Hunter: Suspicious sync ${runId}`,
                  text: `Sync ${runId} on board ${board} flagged suspicious. Predicted changed: ${predictedChanged}, ratio: ${predictedRatio.toFixed(2)}. See attached CSV.`,
                  html: `<p>Sync <strong>${runId}</strong> on board <strong>${board}</strong> marked suspicious.</p><p>Predicted changed: ${predictedChanged}, ratio: ${predictedRatio.toFixed(2)}</p>`,
                  attachments,
                  metadata: { runId, board, source },
                });
                console.error("Enqueued suspicion alert email.");
              }
            } catch (e) {
              console.error("Failed to enqueue suspicion alert:", e);
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
        seenExternalIds.push((job as any).externalId);
        const perJobSuspicious = (job as any).__suspicious === true;
        if (perJobSuspicious) (job as any).__quarantine = true;

        const result = await upsertJob(job as any, runId);
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
        closed = await closeMissingJobs(source as any, board, seenExternalIds, new Date(), runId);
      } else {
        console.error(`%s sync flagged as SUSPICIOUS (predictedChanged=${predictedChanged}, total=${total}, ratio=${predictedRatio.toFixed(2)}). Skipping auto-close.`, source);
      }

      await updateSyncRunCounts(runId as string, jobs.length, changed, closed, isSuspicious, anomalyScore);
      await finishSyncRun(runId as string, "success");
      _finished = true;

      console.error(`${source} sync: ${jobs.length} jobs fetched, ${changed} changed, ${closed} closed. suspicious=${isSuspicious} score=${anomalyScore}`);
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
      console.error(`${source} sync failed for board ${board}: ${msg}`);
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
}

export default syncProvider;
