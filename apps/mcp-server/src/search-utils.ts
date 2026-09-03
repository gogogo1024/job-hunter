import type { JobSearchQuery } from "@job-hunter/domain";

function normalizeToArray(v: any): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.map(String);
  return undefined;
}

export function toJobSearchQuery(raw: any): { query: JobSearchQuery; limit: number; offset: number } {
  const q: any = {};

  q.countries = raw.countries ?? normalizeToArray(raw.country) ?? undefined;
  q.cities = raw.cities ?? normalizeToArray(raw.city) ?? undefined;
  q.levels = raw.levels ?? raw.level ?? undefined;
  q.preferredTechnologies = raw.preferredTechnologies ?? normalizeToArray(raw.technologies) ?? undefined;
  q.excludedPrimaryTechnologies = raw.excludedPrimaryTechnologies ?? normalizeToArray(raw.excludedPrimaryTechnologies) ?? undefined;

  if (raw.minSalary) {
    q.minSalary = raw.minSalary;
  } else if (raw.minBaseCad !== undefined) {
    const n = Number(raw.minBaseCad);
    if (!Number.isNaN(n)) {
      q.minSalary = { amount: n, currency: "CAD", target: "base" };
    }
  }

  q.workModes = raw.workModes ?? normalizeToArray(raw.workMode) ?? undefined;

  if (raw.excludeRecruiters !== undefined) q.excludeRecruiters = Boolean(raw.excludeRecruiters);

  // Intentionally do not run the full Zod parse here to keep this helper
  // lightweight and easy to test in isolation. Consumers should validate
  // against the canonical schema as needed.
  const parsed = q;

  const limit = (() => {
    const v = raw.limit ?? 20;
    const n = Number(v);
    if (!Number.isFinite(n)) return 20;
    return Math.max(1, Math.min(100, Math.trunc(n)));
  })();

  const offset = (() => {
    const v = raw.offset ?? 0;
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
  })();

  return { query: parsed as JobSearchQuery, limit, offset };
}

export function getPrefilterSpec(query: JobSearchQuery) {
  const spec: {
    status: string;
    countries?: string[];
    cities?: string[];
    minSalary?: { amount: number; currency: string };
  } = { status: "open" } as any;

  if (query.countries && query.countries.length) {
    spec.countries = query.countries.map((c) => String(c).toLowerCase());
  }

  if (query.cities && query.cities.length) {
    spec.cities = query.cities.map((c) => String(c).toLowerCase());
  }

  if (query.minSalary) {
    spec.minSalary = { amount: Number(query.minSalary.amount), currency: String(query.minSalary.currency) };
  }

  return spec;
}

export async function buildWhereClausesForQuery(query: JobSearchQuery) {
  const { and, eq, or, sql } = await import('drizzle-orm');
  const { jobs } = await import('@job-hunter/db');

  const whereClauses: any[] = [eq(jobs.status, 'open')];

  if (query.countries && query.countries.length) {
    const countryConds = query.countries.map((c) => sql`LOWER(${jobs.locations}::text) LIKE ${"%" + c.toLowerCase() + "%"}`);
    whereClauses.push(or(...countryConds));
  }

  if (query.cities && query.cities.length) {
    const cityConds = query.cities.map((c) => sql`LOWER(${jobs.locations}::text) LIKE ${"%" + c.toLowerCase() + "%"}`);
    whereClauses.push(or(...cityConds));
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

  return whereClauses;
}

