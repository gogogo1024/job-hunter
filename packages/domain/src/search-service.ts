import type { JobSearchQuery } from "./index.js";
import { searchJobs as repoSearchJobs } from "../../db/src/search.js";
import { matchesHardFilters } from "./index.js";
import type { Job } from "@job-hunter/shared";

export async function searchJobs(query: JobSearchQuery, limit = 20, offset = 0): Promise<Job[]> {
  const candidates: Job[] = await repoSearchJobs(query, limit, offset);

  // Apply domain-level hard filters to avoid false positives from DB-side heuristics.
  const filtered = candidates.filter((j: Job) => matchesHardFilters(j as Job, query)).slice(0, Math.max(1, Math.min(2000, Math.trunc(limit ?? 20))));

  return filtered;
}

export default searchJobs;
