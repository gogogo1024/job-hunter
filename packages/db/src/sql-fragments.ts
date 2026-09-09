import { sql } from "drizzle-orm";
import { jobs, emailJobs, jobFlags } from "./schema.js";

export function locationsILike(value: string) {
  return sql`${jobs.locations}::text ILIKE ${"%" + String(value) + "%"}`;
}

export function workModesILike(value: string) {
  return sql`${jobs.workModes}::text ILIKE ${"%" + String(value) + "%"}`;
}

export function technologiesILike(value: string) {
  return sql`${jobs.technologies}::text ILIKE ${"%" + String(value) + "%"}`;
}

export function salaryCondition(currency: string, amount: number) {
  return sql`(coalesce((${jobs.compensation} ->> 'currency')::text, '') = ${currency} AND (
      ((${jobs.compensation} -> 'base' ->> 'max')::numeric >= ${amount}) OR
      ((${jobs.compensation} -> 'base' ->> 'min')::numeric >= ${amount}) OR
      ((${jobs.compensation} -> 'total' ->> 'max')::numeric >= ${amount}) OR
      ((${jobs.compensation} -> 'total' ->> 'min')::numeric >= ${amount})
    ))`;
}

export function recipientsContains(recipient: string) {
  return sql`${emailJobs.recipients} @> ARRAY[${recipient}]::text[]`;
}

export function incrementAttemptsExpr() {
  return sql`COALESCE(${emailJobs.attempts}, 0) + 1`;
}

/**
 * Exclude jobs that are flagged as problematic or whose company is flagged as problematic.
 * A job is excluded if it or its company has >= THRESHOLD flags of type 'problematic_job' or 'problematic_company'.
 * Threshold: 2 flags
 * 
 * NOTE: This is an internal helper for future community voting feature.
 * Currently disabled in search.ts pending design refinement.
 */
export function excludeFlaggedJobs(threshold = 2) {
  return sql`
    NOT EXISTS (
      SELECT 1 FROM ${jobFlags}
      WHERE (
        (${jobFlags.jobId} = ${jobs.id} AND ${jobFlags.flagType} = 'problematic_job') OR
        (${jobFlags.company} = ${jobs.company} AND ${jobFlags.flagType} = 'problematic_company')
      )
      GROUP BY ${jobFlags.jobId}, ${jobFlags.company}
      HAVING COUNT(*) >= ${threshold}
    )
  `;
}

export default {
  locationsILike,
  workModesILike,
  technologiesILike,
  salaryCondition,
  recipientsContains,
  incrementAttemptsExpr,
  excludeFlaggedJobs,
};
