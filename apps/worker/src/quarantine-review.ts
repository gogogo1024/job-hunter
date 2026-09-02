import "dotenv/config";
import { db, sql, jobs, jobSnapshots, canonicalizeJobForHash, detectSuspiciousChange, hashJobContent, quarantineReviews } from "@job-hunter/db";
import { eq } from "drizzle-orm";

function htmlToText(html?: string): string {
  if (!html) return "";
  const withoutTags = String(html).replace(/<[^>]+>/g, " ");
  const withoutNbsp = withoutTags.replace(/&nbsp;|\u00A0/g, " ");
  return withoutNbsp.replace(/\s+/g, " ").trim();
}

async function listQuarantined() {
  const rows = await db.select({ id: jobs.id, externalId: jobs.externalId, title: jobs.title, company: jobs.company, contentHash: jobs.contentHash, firstSeenAt: jobs.firstSeenAt }).from(jobs).where(eq(jobs.status, "quarantined"));
  if (rows.length === 0) {
    console.log("No quarantined jobs found.");
    return;
  }
  for (const r of rows) {
    console.log(`${(r as any).id} | ${(r as any).externalId} | ${(r as any).title} | company=${(r as any).company} | hash=${(r as any).contentHash} | firstSeen=${(r as any).firstSeenAt}`);
  }
}

async function accept(jobId: string) {
  // fetch latest snapshot via raw SQL to use ORDER BY fetched_at
  const snaps = await sql`SELECT raw, content_hash, fetched_at FROM job_snapshots WHERE job_id = ${jobId} ORDER BY fetched_at DESC LIMIT 1`;
  if (snaps.length === 0) {
    console.error("No snapshots found for", jobId);
    return;
  }
  const snap = snaps[0];
  // load previous main row
  const prevRows = await db.select({ raw: jobs.raw }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const prevRaw = prevRows.length > 0 ? (prevRows[0] as any).raw as Record<string, any> : null;

  // perform field-level merge using detectSuspiciousChange
  const newRaw = snap.raw as Record<string, any>;
  const detect = detectSuspiciousChange(prevRaw as any, newRaw as any);

  const merged: Record<string, any> = { ...newRaw };
  const keys: Array<keyof any> = ["title", "description", "url", "locations", "workModes", "compensation", "technologies"];
  for (const k of keys) {
    const prevVal = prevRaw ? prevRaw[k] : undefined;
    const newVal = newRaw ? newRaw[k] : undefined;
    // if new removed a field and prev had it, keep prev for specific reasons
    if ((k === "technologies") && detect.reasons.includes("technologies_removed") && prevVal && (!newVal || (Array.isArray(newVal) && newVal.length === 0))) {
      merged[k] = prevVal;
      continue;
    }
    if ((k === "locations") && detect.reasons.includes("locations_country_removed") && prevVal && (!newVal || (Array.isArray(newVal) && (newVal as any[]).every((l: any) => !(l && (l.country || l.addressCountry)))))) {
      merged[k] = prevVal;
      continue;
    }
    if ((k === "description") && (detect.reasons.includes("description_shrink") || detect.reasons.includes("description_shrink_severe")) && prevVal && String(newVal ?? "").length < 100) {
      merged[k] = prevVal;
      continue;
    }
    // otherwise prefer new
    merged[k] = newVal ?? prevVal ?? merged[k];
  }

  // compute merged content hash and update main job row fields
  const mergedJobForHash = { ...(newRaw as Record<string, any>), ...merged } as any;
  // Determine preferred descriptionText for storage
  const preferredDescription = (() => {
    if (merged.descriptionText && String(merged.descriptionText).trim().length > 0) return String(merged.descriptionText);
    if (merged.description && String(merged.description).trim().length > 0) return String(merged.description);
    const orig = newRaw as Record<string, any> | undefined;
    if (orig) {
      if (orig.descriptionPlain && String(orig.descriptionPlain).trim().length > 0) return String(orig.descriptionPlain);
      if (orig.descriptionText && String(orig.descriptionText).trim().length > 0) return String(orig.descriptionText);
      if (orig.descriptionHtml && String(orig.descriptionHtml).trim().length > 0) return htmlToText(String(orig.descriptionHtml));
    }
    return String(merged.description ?? "");
  })();

  // ensure hash uses canonical text description
  mergedJobForHash.descriptionText = preferredDescription;
  const newContentHash = hashJobContent(mergedJobForHash as any);

  await db.update(jobs).set({
    raw: merged,
    contentHash: newContentHash,
    title: merged.title ?? (newRaw.title ?? null),
    url: merged.url ?? (newRaw.url ?? null),
    // persist both the legacy `description` and the new `descriptionText`/`descriptionHtml`
    description: merged.description ?? (newRaw.description ?? null),
    descriptionText: preferredDescription,
    descriptionHtml: merged.descriptionHtml ?? (newRaw as any).descriptionHtml ?? null,
    locations: merged.locations ?? (newRaw.locations ?? null),
    workModes: merged.workModes ?? (newRaw.workModes ?? null),
    compensation: merged.compensation ?? (newRaw.compensation ?? null),
    technologies: merged.technologies ?? (newRaw.technologies ?? null),
    status: "open",
    lastChangedAt: new Date(snap.fetched_at),
    lastSeenAt: new Date(),
  }).where(eq(jobs.id, jobId));

  // record review
  const reviewer = process.argv[4] ?? "manual";
  const notes = process.argv[5] ?? null;
  const reviewRow = {
    id: `${jobId}:${Date.now()}`,
    jobId,
    jobSnapshotId: `${jobId}:${new Date(snap.fetched_at).toISOString()}:snapshot`,
    action: "accept",
    reviewer,
    notes,
    createdAt: new Date(),
  } as any;
  await db.insert(quarantineReviews).values(reviewRow as any);

  console.log(`Accepted quarantine for ${jobId} — merged fields and recorded review (${reviewer}).`);
}

async function reject(jobId: string) {
  // simply un-quarantine by setting status to open and leave main row unchanged
  await db.update(jobs).set({ status: "open", lastSeenAt: new Date() }).where(eq(jobs.id, jobId));
  console.log(`Rejected quarantine for ${jobId} — job status set to open.`);
}

async function main() {
  const cmd = process.argv[2] ?? "list";
  if (cmd === "list") return await listQuarantined();
  if (cmd === "accept") {
    const id = process.argv[3];
    if (!id) { console.error("Usage: quarantine-review accept <jobId>"); process.exit(2); }
    return await accept(id);
  }
  if (cmd === "reject") {
    const id = process.argv[3];
    if (!id) { console.error("Usage: quarantine-review reject <jobId>"); process.exit(2); }
    return await reject(id);
  }
  console.error("Unknown command. Usage: quarantine-review [list|accept|reject]");
  process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
