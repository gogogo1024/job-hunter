# job-hunter

Chat-first Job Intelligence Platform built as a TypeScript monorepo.

## Architecture

- `apps/web`: Next.js UI (coming next)
- `apps/api`: Fastify HTTP API
- `apps/worker`: source synchronization/background jobs
- `apps/mcp-server`: MCP adapter for WorkBuddy/Copilot/Claude Code/etc.
- `packages/domain`: domain model and deterministic business rules
- `packages/schema`: Zod input contracts
- `packages/db`: PostgreSQL + Drizzle
- `packages/integrations`: Ashby/Greenhouse/Lever adapters

MCP is an adapter. Business logic lives in the application/domain layers.

## Phase 1 implemented

- Ashby Public Job Postings API fetcher with compensation support
- Ashby job normalization into a shared `Job` model
- PostgreSQL schema with job snapshots
- Upsert + change detection foundation
- Fastify API health endpoint
- MCP `search_jobs` skeleton

Ashby documents its public endpoint as `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true`, returning currently published jobs and optional compensation data. See the official documentation: https://developers.ashbyhq.com/docs/public-job-posting-api

## Local setup

Requirements: Node.js 20+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/compose.yaml up -d
pnpm --filter @job-hunter/db db:generate
pnpm --filter @job-hunter/db db:migrate
```

Sync a real Ashby board:

```bash
pnpm --filter @job-hunter/worker sync:ashby <job-board-name>
```

Then the next milestone is to wire deterministic `search_jobs` directly to PostgreSQL and add Greenhouse + Lever collectors.
