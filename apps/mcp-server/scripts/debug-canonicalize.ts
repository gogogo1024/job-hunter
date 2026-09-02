#!/usr/bin/env tsx
import { db } from "../../../packages/db/src/client.js";
import { jobs, jobSnapshots } from "../../../packages/db/src/schema.js";
import { eq } from "drizzle-orm";
import { canonicalizeJobForHash } from "../../../packages/db/src/repository.js";
import { createHash } from "node:crypto";

async function main() {
  const jobId = process.argv[2] ?? "ashby:imagineart:7d0b8a9b-43cb-400e-ba69-28fe23324d72";
  const prevRows = await db.select({ raw: jobs.raw, contentHash: jobs.contentHash }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  console.log('prevRowCount=', prevRows.length);
  const prev = prevRows.length ? (prevRows[0] as any) : null;

  const snapRows = await db.select({ raw: jobSnapshots.raw, contentHash: jobSnapshots.contentHash, fetchedAt: jobSnapshots.fetchedAt }).from(jobSnapshots).where(eq(jobSnapshots.jobId, jobId));
  console.log('snapRowCount=', snapRows.length);
  const snap = snapRows.length ? (snapRows as any).sort((a: any, b: any) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())[0] : null;

  console.log('jobs.contentHash=', prev?.contentHash ?? null);
  console.log('snapshot.contentHash=', snap?.contentHash ?? null);

  if (prev && snap) {
    const prevCan = canonicalizeJobForHash(prev.raw);
    const newCan = canonicalizeJobForHash(snap.raw);
    console.log('prevCanonical=', JSON.stringify(prevCan, null, 2));
    console.log('newCanonical=', JSON.stringify(newCan, null, 2));
    const hashObj = (o: any) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
    console.log('computedPrevHash=', hashObj(prevCan));
    console.log('computedNewHash=', hashObj(newCan));
    const diffs: Record<string, { before: any; after: any }> = {};
    for (const k of Object.keys(newCan)) {
      const a = JSON.stringify((prevCan as any)[k] ?? null);
      const b = JSON.stringify((newCan as any)[k] ?? null);
      if (a !== b) diffs[k] = { before: JSON.parse(a), after: JSON.parse(b) };
    }
    console.log('diffKeys=', Object.keys(diffs));
    console.log('diffs=', JSON.stringify(diffs, null, 2));
  } else {
    console.log('missing prev or snapshot');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
