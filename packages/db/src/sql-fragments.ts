import { sql } from "drizzle-orm";
import { jobs, emailJobs } from "./schema.js";

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

export default {
  locationsILike,
  workModesILike,
  technologiesILike,
  salaryCondition,
  recipientsContains,
  incrementAttemptsExpr,
};
