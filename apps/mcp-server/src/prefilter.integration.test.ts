import { describe, it, expect } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);
(hasDb ? describe : describe.skip)('DB prefilter integration', () => {
  it('filters by country and minSalary against real postgres', async () => {
    const { db, jobs } = await import('@job-hunter/db');
    const { buildWhereClausesForQuery } = await import('./search-utils.js');

    const id1 = 'prefilter_test_1_' + Date.now();
    const id2 = 'prefilter_test_2_' + Date.now();

    // Insert two test jobs
    await db.insert(jobs).values([
      {
        id: id1,
        externalId: id1,
        source: 'ashby',
        company: 'testco',
        title: 'Dev in Toronto',
        url: 'https://example.com/1',
        description: 'desc',
        locations: [{ raw: 'Toronto, Canada' }],
        workModes: ['remote'],
        level: 'mid',
        compensation: { currency: 'CAD', base: { min: 120000, max: 140000 } },
        technologies: ['ts'],
        raw: {},
      },
      {
        id: id2,
        externalId: id2,
        source: 'ashby',
        company: 'testco',
        title: 'Dev in Berlin',
        url: 'https://example.com/2',
        description: 'desc',
        locations: [{ raw: 'Berlin, Germany' }],
        workModes: ['onsite'],
        level: 'mid',
        compensation: { currency: 'EUR', base: { min: 90000, max: 110000 } },
        technologies: ['go'],
        raw: {},
      },
    ]).returning();

    try {
      const query: any = { countries: ['Canada'], minSalary: { amount: 100000, currency: 'CAD' } };
      const whereClauses = await buildWhereClausesForQuery(query);
      const { and, or, eq } = await import('drizzle-orm');

      const rows = await db
        .select({ id: jobs.id, title: jobs.title, compensation: jobs.compensation, locations: jobs.locations })
        .from(jobs)
        .where(and(...whereClauses));

      const ids = rows.map((r: any) => r.id);
      expect(ids).toContain(id1);
      expect(ids).not.toContain(id2);
    } finally {
      const { or, eq } = await import('drizzle-orm');
      await db.delete(jobs).where(or(eq(jobs.id, id1), eq(jobs.id, id2)));
    }
  });
});
