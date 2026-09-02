import { and, or, inArray, sql, eq, not } from "drizzle-orm";
import { db } from "./client.js";
import { jobs } from "./schema.js";
import type { Job } from "@job-hunter/shared";

export async function searchJobs(query: any, limit = 50): Promise<Job[]> {
  const whereClauses: any[] = [eq(jobs.status, "open")];

  // levels
  if (query.levels && query.levels.length > 0) {
    whereClauses.push(inArray(jobs.level, query.levels as any));
  }

  // workModes (enum array overlap)
  if (query.workModes && query.workModes.length > 0) {
    const modes = (query.workModes as string[]).map((m: string) => String(m).toLowerCase());
    const arr = sql`ARRAY[${sql.join(modes.map((m: string) => sql`${m}`), ",")} ]::work_mode[]`;
    whereClauses.push(sql`${jobs.workModes} && ${arr}`);
  }

  // preferredTechnologies (normalize to lower-case and use array overlap)
  if (query.preferredTechnologies && query.preferredTechnologies.length > 0) {
    const techs = (query.preferredTechnologies as string[]).map((t: string) => String(t).trim().toLowerCase()).filter(Boolean);
    if (techs.length > 0) {
      const arr = sql`ARRAY[${sql.join(techs.map((t: string) => sql`${t}`), ",")} ]::text[]`;
      // Match either technologies array overlap OR descriptionText contains any tech term (case-insensitive)
      const techArrayOverlap = sql`${jobs.technologies} && ${arr}`;
      const descClauses = techs.map((t: string) => sql`${jobs.descriptionText} ILIKE ${"%" + t + "%"}`);
      const descOr = sql`(${sql.join(descClauses as any[], sql` OR `)})`;
      whereClauses.push(sql`(${techArrayOverlap} OR ${descOr})`);
    }
  }

  // locations JSONB @> checks for countries/cities
  if (query.countries && query.countries.length > 0) {
    const countryClauses = (query.countries as string[]).map((c: string) => {
      const js = JSON.stringify([{ country: c }]);
      return sql`${jobs.locations} @> ${js}::jsonb`;
    });
    whereClauses.push(or(...countryClauses));
  }

  if (query.cities && query.cities.length > 0) {
    const cityClauses = (query.cities as string[]).map((c: string) => {
      const js = JSON.stringify([{ city: c }]);
      return sql`${jobs.locations} @> ${js}::jsonb`;
    });
    whereClauses.push(or(...cityClauses));
  }

  // excludeRecruiters: basic DB-side prefilter using ILIKE on company/description fields
  if ((query as any).excludeRecruiters) {
    const terms = ["recruiter", "recruiting", "agency", "talent", "headhunt", "headhunter", "recruitment", "staffing"];
    const recruiterMatchClauses = terms.flatMap((t: string) => [
      sql`${jobs.company} ILIKE ${"%" + t + "%"}`,
      sql`${jobs.descriptionText} ILIKE ${"%" + t + "%"}`,
      sql`${jobs.description} ILIKE ${"%" + t + "%"}`,
    ]);
    if (recruiterMatchClauses.length > 0) {
      whereClauses.push(sql`NOT (${sql.join(recruiterMatchClauses as any[], sql` OR `)})`);
    }
  }

  // minSalary: best-effort DB-side prefilter against compensation JSONB
  if ((query as any).minSalary) {
    const q = (query as any).minSalary as { amount: number; currency: string; period?: string; target?: string };
    const amount = q.amount;
    const currency = q.currency;
    const target = q.target ?? "base";

    if (target === "base") {
      const periodCond = q.period ? sql`AND (compensation->'base'->>'period') = ${q.period}` : sql``;
      const cond = sql`(coalesce((compensation->>'currency')::text, '') = ${currency} AND (
        (NULLIF(compensation->'base'->>'max','')::numeric >= ${amount}) OR
        (NULLIF(compensation->'base'->>'min','')::numeric >= ${amount})
      ) ${periodCond})`;
      whereClauses.push(cond);
    } else {
      // target === 'total'
      const periodCond = q.period ? sql`AND (compensation->'total'->>'period') = ${q.period}` : sql``;
      const cond = sql`(coalesce((compensation->>'currency')::text, '') = ${currency} AND (
        (NULLIF(compensation->'total'->>'max','')::numeric >= ${amount}) OR
        (NULLIF(compensation->'total'->>'min','')::numeric >= ${amount})
      ) ${periodCond})`;
      whereClauses.push(cond);
    }
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
    .limit(Math.min(2000, Math.max(1, Math.trunc(limit ?? 50))));

  return rows.map((r: any) => ({
    id: r.id,
    externalId: r.externalId,
    source: r.source,
    company: r.company,
    title: r.title,
    url: r.url,
    description: r.description,
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
