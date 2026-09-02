import { describe, it, expect } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);
(hasDb ? describe : describe.skip)('searchJobs integration', () => {
  it('matches technologies array or descriptionText for preferredTechnologies', async () => {
    const { db, jobs, searchJobs } = await import('@job-hunter/db');
    const { or, eq } = await import('drizzle-orm');

    const idA = 'search_test_ts_' + Date.now();
    const idB = 'search_test_go_' + Date.now();
    const idC = 'search_test_desc_ts_' + Date.now();

    await db.insert(jobs).values([
      {
        id: idA,
        externalId: idA,
        source: 'ashby',
        company: 'testco',
        title: 'TS Remote Dev',
        url: 'https://example.com/a',
        descriptionText: 'TypeScript developer',
        description: 'TypeScript developer',
        locations: [{ raw: 'Remote' }],
        workModes: ['remote'],
        level: 'mid',
        compensation: { currency: 'USD', base: { min: 100000, max: 120000 } },
        technologies: ['typescript'],
        raw: {},
      },
      {
        id: idB,
        externalId: idB,
        source: 'ashby',
        company: 'testco',
        title: 'Go Remote Dev',
        url: 'https://example.com/b',
        descriptionText: 'Go developer',
        description: 'Go developer',
        locations: [{ raw: 'Remote' }],
        workModes: ['remote'],
        level: 'mid',
        compensation: { currency: 'USD', base: { min: 90000, max: 100000 } },
        technologies: ['go'],
        raw: {},
      },
      {
        id: idC,
        externalId: idC,
        source: 'ashby',
        company: 'testco',
        title: 'Dev with TypeScript in description',
        url: 'https://example.com/c',
        descriptionText: 'We use TypeScript extensively in this team',
        description: 'We use TypeScript extensively in this team',
        locations: [{ raw: 'Remote' }],
        workModes: ['remote'],
        level: 'mid',
        compensation: { currency: 'USD', base: { min: 95000, max: 105000 } },
        technologies: ['nodejs'],
        raw: {},
      },
    ]).returning();

    try {
      const results = await searchJobs({ preferredTechnologies: ['typescript'], workModes: ['remote'], levels: ['mid', 'senior'] }, 50);
      const ids = results.map((r: any) => r.id);
      expect(ids).toContain(idA);
      expect(ids).toContain(idC);
      expect(ids).not.toContain(idB);
    } finally {
      await db.delete(jobs).where(or(eq(jobs.id, idA), eq(jobs.id, idB), eq(jobs.id, idC)));
    }
  });
});
