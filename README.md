# job-hunter

Chat-first Job Intelligence Platform built as a TypeScript monorepo.

## Architecture

- `apps/web`: Next.js Chat UI (coming next) — 左右分栏聊天界面（议案）
- `apps/api`: Fastify HTTP API
- `apps/worker`: source synchronization/background jobs
- `apps/mcp-server`: MCP adapter for WorkBuddy/Copilot/Claude Code/etc.
- `packages/domain`: domain model and deterministic business rules
- `packages/schema`: Zod input contracts
- `packages/db`: PostgreSQL + Drizzle
- `packages/integrations`: Ashby/Greenhouse/Lever adapters

MCP is an adapter. Business logic lives in the application/domain layers.

## Chat-as-search (明确设计说明)

- 目的：用户通过自然语言聊天描述求职偏好，系统将文本解析为**显式的检索过滤器**（例如 location、workMode、technologies、level、salary），并使用确定性 SQL 在本地数据库中检索匹配岗位。系统**不做个性化/推荐**或基于用户画像的隐式排序；返回结果以可解释的过滤规则为准。
- NLU 策略：优先采用规则/关键词/正则映射（rule-based）把用户话语转换为结构化 filter；在必要时可以使用 LLM 做澄清或辅助解析，但 LLM 仅负责生成过滤器，不参与排序/推荐。
- 流式返回：检索结果按确定性排序（例如 `published_at DESC, id`）分批流式发送给前端（通过 WS/SSE），每批结果可被持久化为审计消息以供回放。

## Job Voting & Community Filtering (用户投票过滤)

用户可以标记有问题的岗位或公司，当投票数达到阈值时，搜索结果会自动过滤掉这些内容。

### 投票类型

- `problematic_job` — 标记单个岗位有问题
- `problematic_company` — 标记整个公司有问题  
- `spam` — 标记为垃圾邮件
- `duplicate` — 标记为重复内容

### 投票阈值与过滤

- 默认阈值：2 个用户投票后，该岗位/公司在搜索结果中被过滤
- 投票是**用户级别的**：同一用户对同一岗位只能投一次，避免刷票
- 撤销支持：用户可以撤销自己的投票

### API 使用示例

```typescript
import { 
  addJobFlag, 
  removeJobFlag, 
  getJobFlagStats, 
  isJobFlaggedAsProblematic 
} from "@job-hunter/db";

// 用户投票标记岗位有问题
const flag = await addJobFlag(userId, "problematic_job", {
  jobId: "job-123",
  reason: "虚假宣传",
  metadata: { reportedAt: new Date() }
});

// 标记公司有问题
await addJobFlag(userId, "problematic_company", {
  company: "BadCorp Inc",
  reason: "环境恶劣"
});

// 查看投票统计
const stats = await getJobFlagStats({ jobId: "job-123" });
// [{ jobId: "job-123", count: 3, flagType: "problematic_job" }]

// 检查岗位是否达到过滤阈值
const isFlagged = await isJobFlaggedAsProblematic("job-123", 2);

// 撤销投票
await removeJobFlag(userId, "problematic_job", { jobId: "job-123" });
```

### 搜索过滤

搜索结果会自动过滤掉被投票的内容：

```typescript
// 返回的结果不包含投票数 >= 2 的岗位或其公司的所有岗位
const results = await searchJobs({ 
  levels: ["mid", "senior"],
  countries: ["Remote"]
});
```


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
