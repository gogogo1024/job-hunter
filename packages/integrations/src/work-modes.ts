import type { AshbyJobPosting } from "./ashby.js";
import type { WorkMode } from "@job-hunter/shared";

export function workModes(posting: AshbyJobPosting): WorkMode[] {
  const text = `${posting.location ?? ""} ${(posting.secondaryLocations ?? []).map((x: { location?: string }) => x.location ?? "").join(" ")}`.toLowerCase();

  const remoteRE = /\b(remote|work from home|wfh|fully remote|100% remote|remote-first|remote first)\b/i;
  const hybridRE = /\b(hybrid|hybrid-remote|part-remote|partially remote)\b/i;
  const onsiteRE = /\b(on-?site|in office|in-office|office)\b/i;

  const isRemote = Boolean(posting.isRemote) || remoteRE.test(text);
  const isHybrid = hybridRE.test(text);
  const isOnsite = onsiteRE.test(text);

  if (isRemote) return ["remote"];
  if (isHybrid) return ["hybrid"];
  if (isOnsite) return ["onsite"];
  return ["onsite"];
}
