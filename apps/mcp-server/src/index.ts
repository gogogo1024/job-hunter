import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { ServerContext, InputRequiredResult } from "@modelcontextprotocol/server";
import type { JobSearchQueryInput } from "@job-hunter/schema";
import * as z from "zod/v4";
import { JobSearchQuerySchema } from "@job-hunter/schema";
import type { JobSearchQuery } from "@job-hunter/domain";
import { toJobSearchQuery } from "./search-utils.js";
import { searchJobs as searchService } from "@job-hunter/domain";
import type { Job } from "@job-hunter/shared";

const server = new McpServer({
  name: "job-hunter",
  version: "0.1.0",
});

// `toJobSearchQuery` and `getPrefilterSpec` are implemented in search-utils
// and imported above so they can be unit-tested in isolation.

server.registerTool<JobSearchQueryInput, unknown>(
  "search_jobs",
  {
    description: "Search the local job database using deterministic filters.",
    // Provide the raw Zod shape so the MCP typing overload resolves to the
    // expected signature (the helper will still canonicalize/validate).
    inputSchema: JobSearchQuerySchema.shape,
  },
  async (input: JobSearchQueryInput, ctx: ServerContext): Promise<InputRequiredResult> => {
      try {
        const { query, limit, offset } = toJobSearchQuery(input);

        // Validate the normalized query against the canonical Zod schema.
        const parsed = JobSearchQuerySchema.safeParse(query);
        if (!parsed.success) {
          return {
            resultType: "error",
            content: [
              { type: "text", text: `invalid query: ${parsed.error.message}` },
              { type: "application/json", text: JSON.stringify({ status: "error", error: parsed.error.format() }) },
            ],
          };
        }

        const validatedQuery = parsed.data;

        // Delegate to domain-level search service (DB prefilter + domain filters)
        const matches = await searchService(validatedQuery, limit, offset);

      // Trim results to minimal fields for MCP payload
      const trimmed = matches.map((r) => ({ id: r.id, title: r.title, company: r.company, url: r.url }));

      const payload = { status: "ok", query: validatedQuery, limit, offset, results: trimmed };
      return {
        resultType: "ok",
        content: [
          {
            type: "application/json",
            text: JSON.stringify(payload),
          },
        ],
      };
    } catch (err: any) {
      return {
        resultType: "error",
        content: [
          { type: "text", text: `Error: ${err?.message ?? String(err)}` },
          { type: "application/json", text: JSON.stringify({ status: "error", error: String(err) }) },
        ],
      };
    }
  },
);

await serveStdio(() => server);
console.error("job-hunter MCP server running");
