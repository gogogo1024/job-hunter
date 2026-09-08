import { Queue, QueueScheduler } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import type { EmailJob, Mailer } from "./mailer.js";
import { ResendMailer } from "./resend-mailer.js";
import { NoopMailer } from "./noop-mailer.js";
import { SesMailer } from "./ses-mailer.js";

const REDIS_URL = process.env.REDIS_URL || "";
let queue: Queue | null = null;
let scheduler: QueueScheduler | null = null;

let _mailer: Mailer | null = null;
export function createMailer(): Mailer {
  if (_mailer) return _mailer;
  // Prefer SES when configured
  if (process.env.SES_REGION || process.env.AWS_REGION) {
    _mailer = new SesMailer();
    return _mailer;
  }
  if (process.env.RESEND_API_KEY) {
    _mailer = new ResendMailer();
    return _mailer;
  }
  _mailer = new NoopMailer();
  return _mailer;
}

export function getQueue() {
  return queue;
}

export function initQueue() {
  if (!REDIS_URL) return;
  if (queue) return;
  const connection = new (IORedis as any)(REDIS_URL);
  queue = new Queue("email:jobs", { connection });
  scheduler = new QueueScheduler("email:jobs", { connection });
}

export async function enqueueEmail(job: EmailJob) {
  // ensure mailer is ready for immediate fallback
  const mailer = createMailer();
  if (!REDIS_URL) {
    // fallback: immediate send (synchronous) to keep behavior functional without redis
    const opts: any = {};
    await mailer.sendMail(job.to, job.subject, job.text, job.html, { attachments: job.attachments ?? [] });
    return;
  }

  initQueue();
  if (!queue) throw new Error("queue not initialized");
  // dedupe key if provided
  const opts: any = {};
  if (job.dedupeKey) opts.jobId = job.dedupeKey;
  // Persist email job to DB for audit and suppression checks
  try {
    // lazy import to avoid circular dep at package load
    const { db, emailJobs } = await import("@job-hunter/db");
    const id = job.dedupeKey ?? `e_${Date.now()}_${randomUUID()}`;
    await db.insert(emailJobs).values({
      id,
      dedupeKey: job.dedupeKey ?? null,
      recipients: Array.isArray(job.to) ? job.to : [job.to],
      subject: job.subject,
      bodyText: job.text ?? null,
      bodyHtml: job.html ?? null,
      attachments: job.attachments ?? null,
      metadata: job.metadata ?? null,
      status: "queued",
    } as any);
    opts.jobId = id;
  } catch (err) {
    // best-effort persistence; continue to queue even if DB not available
    console.error("Failed to persist email job to DB:", err);
  }

  await queue.add("send", job, opts);
}

export default { createMailer, enqueueEmail, initQueue, getQueue };
