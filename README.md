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

## 快速运行与开发

- 使用 monorepo 级别的 Turbo 开发命令（在根目录运行）:

```bash
pnpm dev
```

- 单独启动服务或运行脚本（示例）:

```bash
# 启动 API（Fastify）
pnpm --filter @job-hunter/api dev

# 启动 MCP 适配器（stdio MCP server）
pnpm --filter @job-hunter/mcp-server dev

# 启动 Next.js（UI，若已实现）
pnpm --filter @job-hunter/web dev

# 同步 Ashby 数据源（worker）
pnpm --filter @job-hunter/worker sync:ashby <job-board-name>

# 审查隔离队列
pnpm --filter @job-hunter/worker quarantine:review
```

## API 示例

- 健康检查:

```bash
curl http://localhost:3000/health
# 返回: { "ok": true, "service": "job-hunter-api" }
```

（API 默认监听端口 `3000`，可通过 `PORT` 环境变量覆盖）

## 数据库与迁移

- 使用 Drizzle Kit 生成与执行迁移（需要先启动 PostgreSQL 并设置 `DATABASE_URL`）:

```bash
pnpm --filter @job-hunter/db db:generate
pnpm --filter @job-hunter/db db:migrate
```

## 环境变量

- 项目根目录下的 `.env.example` 包含常用变量：

- `DATABASE_URL` — PostgreSQL 连接字符串（必需）
- `ASHBY_JOB_BOARD` — 用于同步的 Ashby job board 名称（worker 使用）

复制并根据本地环境调整：

```bash
cp .env.example .env
```

## 开发与测试

- 运行所有包的测试/类型检查/构建（monorepo）:

```bash
pnpm test
pnpm typecheck
pnpm build
```

- 单包测试示例（mcp-server 有部分单元测试）:

```bash
pnpm --filter @job-hunter/mcp-server test
```

## 贡献

- 欢迎 PR：Fork 后新建分支，遵循 `fix/` 或 `feat/` 前缀，运行全部测试并在 PR 描述中说明变更与验证步骤。

## 其它说明

- 基础镜像与本地服务通过 `infra/compose.yaml` 启动（包含 PostgreSQL）。
- 目前已实现 Ashby 公共岗位抓取、标准化与快照上报；后续计划加入 Greenhouse/Lever 适配器与基于 Postgres 的确定性 `search_jobs`。
 - 目前已实现 Ashby 公共岗位抓取、标准化与快照上报；后续计划加入 Greenhouse/Lever 适配器与基于 Postgres 的确定性 `search_jobs`。

更多设计细节与实现建议见： [docs/DESIGN.md](docs/DESIGN.md)。

---

---

如果你希望我把 README 进一步扩展为「快速入门示例」「接口文档（更多端点）」「体系结构图」或生成一个开发运行脚本 `scripts/devenv.md`，告诉我想要的细节，我会继续完善。
