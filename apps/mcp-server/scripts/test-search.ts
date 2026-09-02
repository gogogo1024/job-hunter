#!/usr/bin/env tsx
import { toJobSearchQuery, buildWhereClausesForQuery } from '../src/search-utils.js';
import { JobSearchQuerySchema } from '@job-hunter/schema';
import { db, jobs } from '@job-hunter/db';
import { and } from 'drizzle-orm';
import { matchesHardFilters } from '@job-hunter/domain';

async function main() {
  // Example raw input — you can edit this to try other queries.
  const raw = {
    city: 'Toronto',
    technologies: ['TypeScript', 'Node.js'],
    limit: 5,
  };

  const { query, limit } = toJobSearchQuery(raw);
  const parsed = JobSearchQuerySchema.safeParse(query);
  if (!parsed.success) {
    console.error('query validation failed:', parsed.error.format());
    process.exit(2);
  }
  const validatedQuery = parsed.data;

  const whereClauses = await buildWhereClausesForQuery(validatedQuery);

  const rows = await db
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      source: jobs.source,
      company: jobs.company,
      title: jobs.title,
      url: jobs.url,
      description: jobs.description,
      locations: jobs.locations,
      workModes: jobs.workModes,
      level: jobs.level,
      compensation: jobs.compensation,
      technologies: jobs.technologies,
      publishedAt: jobs.publishedAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(and(...whereClauses))
    .limit(2000);

  const candidates = rows.map((r: any) => ({
    id: r.id,
    externalId: r.externalId,
    source: r.source,
    company: r.company,
    title: r.title,
    url: r.url,
    description: r.description,
    locations: r.locations ?? [],
    workModes: r.workModes ?? [],
    level: r.level,
    compensation: r.compensation ?? undefined,
    technologies: r.technologies ?? [],
    publishedAt: r.publishedAt ? (r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt)) : undefined,
    updatedAt: r.updatedAt ? (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt)) : undefined,
  }));

  const matches = candidates.filter((j) => matchesHardFilters(j, validatedQuery)).slice(0, limit);

  const trimmed = matches.map((r) => ({ id: r.id, title: r.title, company: r.company, url: r.url }));

  console.log(JSON.stringify({ status: 'ok', query: validatedQuery, limit, results: trimmed }, null, 2));
}

main().catch((err) => {
  console.error('test failed:', err);
  process.exit(1);
});
