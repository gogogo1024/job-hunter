#!/usr/bin/env tsx
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import type { ServerContext, InputRequiredResult } from '@modelcontextprotocol/server';
import type { JobSearchQueryInput } from '@job-hunter/schema';
import { JobSearchQuerySchema } from '@job-hunter/schema';
import { toJobSearchQuery, buildWhereClausesForQuery } from '../src/search-utils.js';
import { db, jobs } from '@job-hunter/db';
import { and } from 'drizzle-orm';
import { matchesHardFilters } from '@job-hunter/domain';

async function main() {
  const server = new McpServer({ name: 'job-hunter-test', version: '0.1.0' });

  server.registerTool<JobSearchQueryInput, unknown>(
    'search_jobs',
    {
      description: 'Search the local job database using deterministic filters.',
      inputSchema: JobSearchQuerySchema.shape,
    },
    async (input: JobSearchQueryInput, ctx: ServerContext): Promise<InputRequiredResult> => {
      try {
        const { query, limit } = toJobSearchQuery(input as any);

        const parsed = JobSearchQuerySchema.safeParse(query);
        if (!parsed.success) {
          return {
            resultType: 'error',
            content: [
              { type: 'text', text: `invalid query: ${parsed.error.message}` },
              { type: 'application/json', text: JSON.stringify({ status: 'error', error: parsed.error.format() }) },
            ],
          };
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

        return {
          resultType: 'ok',
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'ok', query: validatedQuery, limit, results: trimmed }),
            },
          ],
        };
      } catch (err: any) {
        return {
          resultType: 'error',
          content: [
            { type: 'text', text: `invalid query: ${err?.message ?? String(err)}` },
            { type: 'text', text: JSON.stringify({ status: 'error', error: String(err) }) },
          ],
        };
      }
    },
  );

  const handler = createMcpHandler(async () => server, { responseMode: 'json' });

  // Build a JSON-RPC `tools/call` message for `search_jobs`
  const params = { name: 'search_jobs', arguments: { city: 'Toronto', technologies: ['TypeScript', 'Node.js'], limit: 5 } };
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params };

  const req = new Request('https://example.local/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(message),
  });

  const res = await handler.fetch(req as any);
  const body = await res.text();
  console.log('status:', res.status);
  console.log('body:', body);

  await handler.close();
}

main().catch((err) => {
  console.error('test failed:', err);
  process.exit(1);
});
