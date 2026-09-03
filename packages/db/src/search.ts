import { db } from "./client.js";
import { jobs } from "./schema.js";
import { and, eq, or, sql } from "drizzle-orm";
import type { Job } from "@job-hunter/shared";

export async function searchJobs(query: any, limit = 50, offset = 0): Promise<Job[]> {
  const whereClauses: any[] = [eq(jobs.status, "open")];

  if (query.countries && query.countries.length) {
    const countryConds = query.countries.map((c: string) => sql`LOWER(${jobs.locations}::text) LIKE ${"%" + String(c).toLowerCase() + "%"}`);
    whereClauses.push(or(...countryConds));
  }

  if (query.cities && query.cities.length) {
    const cityConds = query.cities.map((c: string) => sql`LOWER(${jobs.locations}::text) LIKE ${"%" + String(c).toLowerCase() + "%"}`);
    whereClauses.push(or(...cityConds));
  }

  if (query.levels && query.levels.length) {
    const levelConds = query.levels.map((l: any) => sql`${jobs.level} = ${l}`);
    whereClauses.push(or(...levelConds));
  }

  if (query.workModes && query.workModes.length) {
    const modeConds = query.workModes.map((m: string) => sql`LOWER(${jobs.workModes}::text) LIKE ${"%" + String(m).toLowerCase() + "%"}`);
    whereClauses.push(or(...modeConds));
  }

  if (query.preferredTechnologies && query.preferredTechnologies.length) {
    const techConds = query.preferredTechnologies.map((t: string) => sql`LOWER(${jobs.technologies}::text) LIKE ${"%" + String(t).toLowerCase() + "%"}`);
    whereClauses.push(or(...techConds));
  }

  if (query.minSalary) {
    const amount = query.minSalary.amount;
    const currency = query.minSalary.currency;
    const salaryCond = sql`(coalesce((compensation->>'currency')::text, '') = ${currency} AND (
      (compensation->'base'->>'max')::numeric >= ${amount} OR
      (compensation->'base'->>'min')::numeric >= ${amount} OR
      (compensation->'total'->>'max')::numeric >= ${amount} OR
      (compensation->'total'->>'min')::numeric >= ${amount}
    ))`;
    whereClauses.push(salaryCond);
  }

  const rows = await db
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      source: jobs.source,
      company: jobs.company,
      title: jobs.title,
      url: jobs.url,
      description: jobs.description,
      descriptionText: jobs.descriptionText,
      descriptionHtml: jobs.descriptionHtml,
      locations: jobs.locations,
      workModes: jobs.workModes,
      level: jobs.level,
      compensation: jobs.compensation,
      technologies: jobs.technologies,
      publishedAt: jobs.publishedAt,
      updatedAt: jobs.updatedAt,
      raw: jobs.raw,
    })
    .from(jobs)
    .where(and(...whereClauses))
    .offset(Math.max(0, Math.trunc(offset ?? 0)))
    .limit(Math.min(2000, Math.max(1, Math.trunc(limit ?? 50))));

  return rows.map((r: any) => ({
    id: r.id,
    externalId: r.externalId,
    source: r.source,
    company: r.company,
    title: r.title,
    url: r.url,
    description: r.description,
    // expose canonical text fields when available
    descriptionText: (r as any).descriptionText ?? undefined,
    descriptionHtml: (r as any).descriptionHtml ?? undefined,
    locations: r.locations ?? [],
    workModes: r.workModes ?? [],
    level: r.level,
    compensation: r.compensation ?? undefined,
    technologies: r.technologies ?? [],
    publishedAt: r.publishedAt ? (r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt)) : undefined,
    updatedAt: r.updatedAt ? (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt)) : undefined,
    raw: r.raw ?? undefined,
  } as Job));
}

export default searchJobs;
