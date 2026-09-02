#!/usr/bin/env tsx
import http from 'node:http';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { JobSearchQuerySchema } from '@job-hunter/schema';
import { toJobSearchQuery, buildWhereClausesForQuery } from '../src/search-utils.js';
import { db, jobs } from '@job-hunter/db';
import { and } from 'drizzle-orm';
import { matchesHardFilters } from '@job-hunter/domain';

const PORT = Number(process.env.PORT ?? 8787);

function formatDate(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (val instanceof Date) return val.toISOString();
  try {
    return String(val);
  } catch {
    return undefined;
  }
}

function registerSearchTool(server: any) {
  server.registerTool(
    'search_jobs',
    {
      description: 'Search the local job database using deterministic filters.',
      // use .shape so the registerTool overload expecting a ZodRawShape matches
      inputSchema: JobSearchQuerySchema.shape,
    },
    async (input: unknown, ctx: unknown) => {
      // mark ctx as used to avoid "declared but not used" errors
      void ctx;

      try {
        const { query, limit } = toJobSearchQuery(input as any);

        const parsed = JobSearchQuerySchema.safeParse(query);
        if (!parsed.success) {
          const zodError = parsed.error.flatten(); // preferred over deprecated format()
          return {
            resultType: 'error',
            content: [
              { type: 'text', text: `invalid query: ${parsed.error.message}` },
              { type: 'application/json', text: JSON.stringify({ status: 'error', error: zodError }) },
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

        const candidates = rows.map((r: any) => {
          const published = formatDate(r.publishedAt);
          const updated = formatDate(r.updatedAt);
          return {
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
            publishedAt: published,
            updatedAt: updated,
          };
        });

        const matches = candidates.filter((j) => matchesHardFilters(j, validatedQuery)).slice(0, limit);

        const trimmed = matches.map((r) => ({ id: r.id, title: r.title, company: r.company, url: r.url }));

        return {
          resultType: 'ok',
          content: [
            { type: 'text', text: JSON.stringify({ status: 'ok', query: validatedQuery, limit, results: trimmed }) },
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
}

async function start() {
  const server = new McpServer({ name: 'job-hunter-http', version: '0.1.0' });
  registerSearchTool(server);

  const handler = createMcpHandler(async () => server, { responseMode: 'json' });

  const httpServer = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `localhost:${PORT}`;
      const url = new URL(req.url ?? '/', `http://${host}`);
      const init: any = { method: req.method, headers: req.headers };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // enable streaming request body for fetch
        init.body = req;
        init.duplex = 'half';
      }
      const request = new Request(url.toString(), init as any);
      const response = await handler.fetch(request as any);

      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

      if (response.body) {
        const reader = (response.body as any).getReader?.();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
          return;
        }
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
        return;
      }
      res.end();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err));
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.error(`MCP HTTP test server running on http://localhost:${PORT}/`);

  process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
  process.on('SIGTERM', () => httpServer.close(() => process.exit(0)));
}

try {
  await start();
} catch (err) {
  console.error(err);
  process.exit(1);
}