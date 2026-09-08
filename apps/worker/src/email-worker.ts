import "dotenv/config";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import IORedis from "ioredis";
import { createMailer } from "@job-hunter/notifications";
import { markEmailJobSent, markEmailJobFailed } from "@job-hunter/db";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("REDIS_URL not configured; email-worker requires Redis to run.");
  process.exit(1);
}

const connection = new (IORedis as any)(REDIS_URL);

const mailer = createMailer();

const worker = new Worker(
  "email:jobs",
  async (job: Job | any) => {
    const data = job.data as any;
    try {
      const res = await mailer.sendMail(data.to, data.subject, data.text, data.html, { attachments: data.attachments });
      // If the queued job used our persisted jobId as job.id, update DB
      try {
        const jobId = String(job.id);
        if (jobId) {
          const providerMessageId = (res && (res as any).messageId) ? String((res as any).messageId) : undefined;
          await markEmailJobSent(jobId, providerMessageId);
        }
      } catch (err) {
        console.error("Failed updating email job status to sent:", err);
      }
      return { ok: true };
    } catch (err) {
      console.error("email-worker send failed:", err);
      try {
        const jobId = String(job.id);
        if (jobId) await markEmailJobFailed(jobId, (err as Error)?.message ?? String(err));
      } catch (e) {
        console.error("Failed updating email job status on failure:", e);
      }
      throw err;
    }
  },
  { connection },
);

worker.on("completed", (job: Job | undefined) => {
  console.info(`email job ${job?.id} completed`);
});
worker.on("failed", (job: Job | undefined, err?: Error | any) => {
  console.error(`email job ${job?.id} failed:`, err?.message ?? err);
});

process.on("SIGINT", async () => {
  console.error("shutting down email worker");
  await worker.close();
  connection.disconnect();
  process.exit(0);
});
