import { and, eq, not, inArray, sql } from "drizzle-orm";
import type { WorkMode, JobLevel } from "@job-hunter/shared";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "./client.js";
import { jobs, jobSnapshots, syncRuns, jobSnapshotDiffs } from "./schema.js";
import type { Job } from "@job-hunter/shared";
import { createHash } from "node:crypto";

export function hashJobContent(job: Job): string {
  return createHash("sha256").update(JSON.stringify(canonicalizeJobForHash(job))).digest("hex");
}

function htmlToText(html?: string): string {
  if (!html) return "";
  const withoutTags = String(html).replace(/<[^>]+>/g, " ");
  const withoutNbsp = withoutTags.replace(/&nbsp;|\u00A0/g, " ");
  return withoutNbsp.replace(/\s+/g, " ").trim();
}

export function canonicalizeJobForHash(jobLike: any) {
  const normalizeText = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim();

  const canonicalTitle = normalizeText(jobLike.title ?? jobLike.externalTitle ?? "");
  // Prefer a pre-extracted text description. If missing, try original raw's descriptionPlain/descriptionText,
  // or as last resort convert descriptionHtml to text (fallback only).
  const preferredDescCandidate = (() => {
    // Prefer explicit `descriptionText` when available (normalized text extraction).
    if (jobLike.descriptionText && String(jobLike.descriptionText).trim().length > 0) return String(jobLike.descriptionText);
    // Fallback to legacy `description` property for backward compatibility with older records.
    if (jobLike.description && String(jobLike.description).trim().length > 0) return String(jobLike.description);
    const orig = jobLike.__originalRaw ?? (jobLike.raw ?? null);
    if (orig) {
      if (orig.descriptionPlain && String(orig.descriptionPlain).trim().length > 0) return String(orig.descriptionPlain);
      if (orig.descriptionText && String(orig.descriptionText).trim().length > 0) return String(orig.descriptionText);
      if (orig.descriptionHtml && String(orig.descriptionHtml).trim().length > 0) return htmlToText(String(orig.descriptionHtml));
    }
    return "";
  })();

  const canonicalDescription = normalizeText(preferredDescCandidate ?? "");
  const canonicalUrl = (jobLike.url ?? "").toString().replace(/\/?$/, "");

  const canonicalLocations = (jobLike.locations ?? []).map((loc: any) => {
    return {
      country: (loc?.country ?? "").toString().trim(),
      region: (loc?.region ?? "").toString().trim(),
      city: (loc?.city ?? "").toString().trim(),
      raw: (loc?.raw ?? "").toString().trim(),
    };
  })
    .map((l: any) => ({
      key: [l.country, l.region, l.city, l.raw].map((x: string) => x.toLowerCase()).join("|"),
      val: { country: l.country || undefined, region: l.region || undefined, city: l.city || undefined, raw: l.raw || undefined },
    }))
    .sort((a: any, b: any) => a.key.localeCompare(b.key))
    .map((x: any) => x.val);

  const canonicalWorkModes = Array.from(new Set((jobLike.workModes ?? []).map((w: any) => (w ?? "").toString().toLowerCase()))).sort();

  const canonicalTechnologies = Array.from(new Set((jobLike.technologies ?? []).map((t: any) => (t ?? "").toString().trim().toLowerCase()))).sort();

  const c = jobLike.compensation ?? jobLike.comp ?? undefined;
  const canonicalCompensation = (() => {
    if (!c) return undefined;
    const out: any = { currency: c.currency };
    if (c.base) out.base = { min: c.base.min ?? null, max: c.base.max ?? null, period: c.base.period ?? null };
    if (c.bonus) out.bonus = { type: c.bonus.type, min: c.bonus.min ?? null, max: c.bonus.max ?? null, percent: c.bonus.percent ?? null, period: c.bonus.period ?? null };
    if (c.total) out.total = { min: c.total.min ?? null, max: c.total.max ?? null, period: c.total.period ?? null };
    return out;
  })();

  return {
    title: canonicalTitle,
    // Persist text-only description into `descriptionText` (DB column `description_text`).
    descriptionText: canonicalDescription,
    url: canonicalUrl,
    locations: canonicalLocations,
    workModes: canonicalWorkModes,
    compensation: canonicalCompensation,
    technologies: canonicalTechnologies,
  };
}

export async function getJobRaw(source: Job["source"], externalId: string): Promise<Record<string, unknown> | null> {
  const rows = await db.select({ raw: jobs.raw }).from(jobs).where(and(eq(jobs.source, source), eq(jobs.externalId, externalId))).limit(1);
  if (rows.length === 0) return null;
  return (rows[0] as any).raw ?? null;
}

type JobInsert = InferInsertModel<typeof jobs>;
type JobSnapshotInsert = InferInsertModel<typeof jobSnapshots>;
type JobSnapshotDiffInsert = InferInsertModel<typeof jobSnapshotDiffs>;
type SyncRunInsert = InferInsertModel<typeof syncRuns>;

function jobToRaw(job: Job): Record<string, unknown> {
  // Ensure we store a JSON-serializable plain object for the raw snapshot/record.
  // This strips prototypes and converts Dates to ISO strings.
  return JSON.parse(JSON.stringify(job));
}

export async function upsertJob(job: Job, syncRunId?: string): Promise<{ changed: boolean }> {
  const now = new Date();
  const existing = await db
    .select({ contentHash: jobs.contentHash })
    .from(jobs)
    .where(
      and(eq(jobs.source, job.source), eq(jobs.externalId, job.externalId)),
    )
    .limit(1);

  const contentHash = hashJobContent(job);
  const existingContentHash = (existing[0] as { contentHash?: string } | undefined)?.contentHash ?? null;

  // If there's an existing jobs row, fetch its raw BEFORE we perform the upsert/update
  // so we can compute a proper "before" state for snapshot diffs. Previously the
  // code fetched the previous raw after doing the upsert which returned the new
  // value and therefore produced no diffs.
  let prevRawFromJobs: Record<string, any> | null = null;
  if (existing.length > 0) {
    const prevRows = await db
      .select({ raw: jobs.raw })
      .from(jobs)
      .where(and(eq(jobs.source, job.source), eq(jobs.externalId, job.externalId)))
      .limit(1);
    if (prevRows.length > 0) prevRawFromJobs = (prevRows[0] as any).raw ?? null;
  }

  // Determine preferred description to persist: prefer `descriptionText` or `description`,
  // then look into original/raw payload's `descriptionPlain`/`descriptionText`,
  // finally fall back to converting `descriptionHtml`.
  const preferredDescription = (() => {
    if ((job as any).descriptionText && String((job as any).descriptionText).trim().length > 0) return String((job as any).descriptionText);
    if ((job as any).description && String((job as any).description).trim().length > 0) return String((job as any).description);
    const orig = (job as any).__originalRaw ?? ((job as any).raw ?? null);
    if (orig) {
      if (orig.descriptionPlain && String(orig.descriptionPlain).trim().length > 0) return String(orig.descriptionPlain);
      if (orig.descriptionText && String(orig.descriptionText).trim().length > 0) return String(orig.descriptionText);
      if (orig.descriptionHtml && String(orig.descriptionHtml).trim().length > 0) return htmlToText(String(orig.descriptionHtml));
    }
    return String((job as any).description ?? "");
  })();

  const prevComputedHash = prevRawFromJobs ? hashJobContent(prevRawFromJobs as any) : existingContentHash;
  const changed = existing.length === 0 || prevComputedHash !== contentHash;

  // Compute whether this job changed by comparing the previous stored raw
  // (prefetched in the caller) to the new content hash. The actual
  // prefetched raw is set inside `upsertJob` and will be used there; we
  // keep this here as a placeholder comment only.

  const insertObj: JobInsert = {
    id: job.id,
    externalId: job.externalId,
    source: job.source,
    company: job.company,
    title: job.title,
    url: job.url,
      descriptionText: preferredDescription,
      // keep legacy description for compatibility
      description: preferredDescription,
    locations: job.locations,
    workModes: job.workModes,
    level: job.level,
    compensation: job.compensation,
    technologies: job.technologies,
    publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
    updatedAt: job.updatedAt ? new Date(job.updatedAt) : null,
    status: "open",
      raw: jobToRaw(job),
    contentHash,
    lastSeenAt: now,
    ...(changed ? { lastChangedAt: now } : {}),
  };

  const updateObj: Partial<JobInsert> = {
    company: job.company,
    title: job.title,
    url: job.url,
      descriptionText: preferredDescription,
      // keep legacy description for compatibility
      description: preferredDescription,
    locations: job.locations,
    workModes: job.workModes,
    level: job.level,
    compensation: job.compensation,
    technologies: job.technologies,
    publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
    updatedAt: job.updatedAt ? new Date(job.updatedAt) : null,
    status: "open",
      raw: jobToRaw(job),
    lastSeenAt: now,
    ...(changed ? { contentHash, lastChangedAt: now } : {}),
  };

  // If this job is quarantined and there is an existing record, avoid overwriting the primary
  // `jobs` row to prevent discarding presumably-good historical data. 
  // If there's no existing row (new job), allow insert normally without quarantine status.
  const isQuarantine = (job as any).__quarantine === true;
  const hasExisting = existing.length > 0;
  const shouldUpdateMain = !(isQuarantine && hasExisting);

  // Only mark as quarantined if updating existing records during suspicious sync
  // New records (insertions) should not be marked quarantined to remain searchable
  if (isQuarantine && hasExisting) {
    updateObj.status = "quarantined" as any;
  }

  if (shouldUpdateMain) {
    await db.insert(jobs).values(insertObj).onConflictDoUpdate({
      target: [jobs.source, jobs.externalId],
      set: updateObj,
    });
  } else {
    // Do not touch `jobs` main row when quarantined and an existing record exists.
  }

  const snapshot: JobSnapshotInsert = {
    id: `${job.id}:${now.toISOString()}`,
    jobId: job.id,
    contentHash,
    raw: jobToRaw(job),
    // `changed` should be determined by comparing the previous canonicalized raw
    // (if available) to the new canonicalized payload. We'll compute it below
    // after we've prefetched the previous raw from `jobs`.
    changed,
    syncRunId: syncRunId ?? null,
  };

  await db.insert(jobSnapshots).values(snapshot);

  // Insert a lightweight diff object to help auditing what changed.
  // Compute canonical forms and record keys that differ.
  try {
    const prev = existing[0] as { contentHash?: string } | undefined;
    const prevCanonical = prev ? null : null; // placeholder, retrieving previous canonical would require fetching raw; skip when no previous
    const newCanonical = canonicalizeJobForHash(job);
    // If there was a previous row, use the previously-prefetched `prevRawFromJobs`
    // (fetched before the upsert) to compute a stable diff. If that prefetch
    // didn't exist for some reason, fall back to reading the jobs.raw value.
    if (existing.length > 0) {
      try {
        let prevRaw: Record<string, any> | undefined = undefined;
        if (prevRawFromJobs) {
          prevRaw = prevRawFromJobs;
        } else {
          const prevRows2 = await db.select({ raw: jobs.raw }).from(jobs).where(and(eq(jobs.source, job.source), eq(jobs.externalId, job.externalId))).limit(1);
          if (prevRows2.length > 0) prevRaw = prevRows2[0]?.raw as Record<string, any> | undefined;
        }

        // Debugging: log whether we have a prevRaw and the hashes involved so we can
        // diagnose why diffs are not being created in the sync path.
        try {
          // eslint-disable-next-line no-console
          console.debug(`[db-debug] computeDiff jobId=${job.id} hasPrevRaw=${!!prevRaw} existingContentHash=${(existing[0] as any)?.contentHash ?? null} newContentHash=${contentHash} shouldUpdateMain=${shouldUpdateMain}`);
        } catch {}

        if (prevRaw) {
          const prevCan = canonicalizeJobForHash(prevRaw);
          const diffs: Record<string, { before: any; after: any }> = {};
          for (const k of Object.keys(newCanonical)) {
            const a = JSON.stringify((prevCan as any)[k] ?? null);
            const b = JSON.stringify((newCanonical as any)[k] ?? null);
            if (a !== b) diffs[k] = { before: JSON.parse(a), after: JSON.parse(b) };
          }

          try {
            // eslint-disable-next-line no-console
            console.debug(`[db-debug] computeDiff jobId=${job.id} diffsCount=${Object.keys(diffs).length} diffsKeys=${Object.keys(diffs).join(",")}`);
          } catch {}

          if (Object.keys(diffs).length > 0) {
            const diffRow: JobSnapshotDiffInsert = {
              id: `${snapshot.id}:diff`,
              jobSnapshotId: snapshot.id,
              jobId: job.id,
              diff: diffs as unknown as Record<string, unknown>,
              syncRunId: syncRunId ?? null,
              createdAt: new Date(),
            };
            await db.insert(jobSnapshotDiffs).values(diffRow);
          }
        }
      } catch (err) {
        // best-effort; swallow diff errors
      }
    }
  } catch (err) {
    // swallow audit errors to avoid breaking upsert path
  }

  return { changed };
}

export async function closeMissingJobs(
  source: Job["source"],
  board: string,
  presentExternalIds: string[],
  when: Date = new Date(),
  syncRunId?: string,
): Promise<number> {
  // Select rows that will be closed so we can record snapshots/diffs for audit.
  let toCloseRows: Array<{ id: string; raw: Record<string, unknown> | null; contentHash?: string | null; status?: string | null }> = [];
  if (presentExternalIds.length === 0) {
    toCloseRows = await db
      .select({ id: jobs.id, raw: jobs.raw, contentHash: jobs.contentHash, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.source, source), eq(jobs.company, board), not(eq(jobs.status, "closed"))));
  } else {
    toCloseRows = await db
      .select({ id: jobs.id, raw: jobs.raw, contentHash: jobs.contentHash, status: jobs.status })
      .from(jobs)
      .where(
        and(
          eq(jobs.source, source),
          eq(jobs.company, board),
          not(eq(jobs.status, "closed")),
          not(inArray(jobs.externalId, presentExternalIds)),
        ),
      );
  }

  if (toCloseRows.length === 0) return 0;

  // Perform the update to mark them closed
  await db
    .update(jobs)
    .set({ status: "closed", lastSeenAt: when, lastChangedAt: when })
    .where(
      and(
        eq(jobs.source, source),
        eq(jobs.company, board),
        not(eq(jobs.status, "closed")),
        presentExternalIds.length === 0 ? sql`TRUE` : not(inArray(jobs.externalId, presentExternalIds)),
      ),
    );

  // For each closed job, write a snapshot and a simple diff indicating status change
  for (const r of toCloseRows) {
    try {
      const snapId = `${r.id}:${when.toISOString()}`;
      const snapshot: JobSnapshotInsert = {
        id: snapId,
        jobId: r.id,
        contentHash: r.contentHash ?? "",
        raw: (r.raw as Record<string, unknown>) ?? {},
        changed: true,
        syncRunId: syncRunId ?? null,
        fetchedAt: when,
      } as any;
      await db.insert(jobSnapshots).values(snapshot);

      const diffRow: JobSnapshotDiffInsert = {
        id: `${snapId}:closed:diff`,
        jobSnapshotId: snapId,
        jobId: r.id,
        diff: { status: { before: r.status ?? "unknown", after: "closed" } } as unknown as Record<string, unknown>,
        syncRunId: syncRunId ?? null,
        createdAt: when,
      } as any;
      await db.insert(jobSnapshotDiffs).values(diffRow);
    } catch (err) {
      // best-effort; don't fail the closing operation for audit insertion problems
    }
  }

  return toCloseRows.length;
}

export async function getJobsContentHashes(source: Job["source"], board: string, externalIds: string[]): Promise<Record<string, string | null>> {
  if (externalIds.length === 0) return {};
  // To avoid false positives caused by a stale or differently-computed `contentHash`
  // column, prefer to recompute the canonical hash from the stored `raw` payload
  // when available. Fall back to the stored `contentHash` value only when `raw`
  // is missing for a row.
  const rows = await db.select({ externalId: jobs.externalId, raw: jobs.raw, contentHash: jobs.contentHash }).from(jobs).where(and(eq(jobs.source, source), eq(jobs.company, board), inArray(jobs.externalId, externalIds)));
  const out: Record<string, string | null> = {};
  for (const r of rows) {
    const ext = (r as any).externalId as string;
    const raw = (r as any).raw as Record<string, unknown> | undefined | null;
    if (raw) {
      try {
        out[ext] = hashJobContent(raw as any);
        continue;
      } catch (err) {
        // If hashing fails for whatever reason, fall through to using stored column
      }
    }
    out[ext] = (r as any).contentHash ?? null;
  }
  return out;
}

export function detectSuspiciousChange(prevRaw: Record<string, any> | null | undefined, newJob: Job): { suspicious: boolean; reasons: string[]; score: number } {
  const reasons: string[] = [];
  if (!prevRaw) return { suspicious: false, reasons, score: 0 };

  const normList = (arr: any) => (Array.isArray(arr) ? Array.from(new Set(arr.map((x: any) => String(x ?? "").trim().toLowerCase()).filter(Boolean))) : []);
  const prevTech = normList(prevRaw.technologies ?? prevRaw.primaryTechnologies ?? []);
  const newTech = normList(newJob.technologies ?? newJob.primaryTechnologies ?? []);
  if (prevTech.length > 0 && newTech.length === 0) reasons.push("technologies_removed");

  const prevLocations = Array.isArray(prevRaw.locations) ? prevRaw.locations : [];
  const newLocations = Array.isArray(newJob.locations) ? newJob.locations : [];
  const prevHasCountry = prevLocations.some((l: any) => !!(l && (l.country || l.addressCountry)));
  const newHasCountry = newLocations.some((l: any) => !!(l && (l.country || l.addressCountry)));
  if (prevHasCountry && !newHasCountry) reasons.push("locations_country_removed");

  const prevDesc = String(prevRaw?.description ?? (prevRaw as any)?.descriptionText ?? (prevRaw as any)?.descriptionPlain ?? "").trim();
  const newDesc = String(newJob.description ?? (newJob as any)?.descriptionText ?? (newJob as any)?.descriptionPlain ?? "").trim();
  if (prevDesc.length > 200 && newDesc.length < 50) reasons.push("description_shrink");
  if (prevDesc.length > 0 && newDesc.length < prevDesc.length * 0.2) reasons.push("description_shrink_severe");

  const weight: Record<string, number> = { technologies_removed: 60, locations_country_removed: 60, description_shrink: 30, description_shrink_severe: 50 };
  const score = reasons.reduce((s, r) => s + (weight[r] ?? 10), 0);
  const suspicious = score >= 50;
  return { suspicious, reasons, score };
}

export async function createSyncRun(source: Job["source"], board: string, startedAt: Date = new Date()): Promise<{ id: string }> {
  const id = `${source}:${board}:${startedAt.toISOString()}`;
  await db.insert(syncRuns).values({
    id,
    source,
    board,
    startedAt: startedAt,
    status: "running",
    fetchedCount: 0,
    changedCount: 0,
    closedCount: 0,
    // anomaly detection fields
    isSuspicious: false,
    anomalyScore: 0,
    error: null,
  });
  return { id };
}

export async function updateSyncRunCounts(
  id: string,
  fetchedCount?: number,
  changedCount?: number,
  closedCount?: number,
  isSuspicious?: boolean,
  anomalyScore?: number,
): Promise<void> {
  const setObj: Record<string, unknown> = {};
  if (typeof fetchedCount === "number") setObj.fetchedCount = fetchedCount;
  if (typeof changedCount === "number") setObj.changedCount = changedCount;
  if (typeof closedCount === "number") setObj.closedCount = closedCount;
  if (typeof isSuspicious === "boolean") setObj.isSuspicious = isSuspicious;
  if (typeof anomalyScore === "number") setObj.anomalyScore = anomalyScore;
  if (Object.keys(setObj).length === 0) return;
  await db.update(syncRuns).set(setObj).where(eq(syncRuns.id, id));
}

export async function finishSyncRun(id: string, status: "success" | "failed", finishedAt: Date = new Date(), error?: string): Promise<void> {
  await db.update(syncRuns).set({ status, finishedAt, error: error ?? null }).where(eq(syncRuns.id, id));
}
