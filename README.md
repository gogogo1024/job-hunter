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


## Phase 1 implemented

- Ashby Public Job Postings API fetcher with compensation support
- Ashby job normalization into a shared `Job` model
- PostgreSQL schema with job snapshots
- Upsert + change detection foundation
- Fastify API health endpoint
- MCP `search_jobs` skeleton

Ashby documents its public endpoint as `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true`, returning currently published jobs and optional compensation data. See the official documentation: https://developers.ashbyhq.com/docs/public-job-posting-api

## Local setup

Requirements: Node.js 24+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env
# Edit .env to configure database, Ashby, and AI provider
docker compose -f infra/compose.yaml up -d
pnpm --filter @job-hunter/db db:generate
pnpm --filter @job-hunter/db db:migrate
```

### AI Provider Configuration

The system supports three AI providers for job analysis (Claude, Gemini, GPT). Configure in `.env`:

```bash
# Select provider (default: anthropic)
AI_PROVIDER=anthropic  # or: google, openai

# Set the corresponding API key
ANTHROPIC_API_KEY=sk-ant-...    # For Claude
GOOGLE_API_KEY=...              # For Gemini
OPENAI_API_KEY=sk-...            # For GPT

# Optional: override default models
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
GOOGLE_MODEL=gemini-1.5-flash
OPENAI_MODEL=gpt-4o-mini
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

# 运行 AI 特征提取（需要配置 AI_PROVIDER 和对应 API_KEY）
pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts
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

## Infrastructure as Code (IaC) 配置管理

**重要**: 本项目使用 Infrastructure as Code 方式来管理配置和敏感密钥，而不是依赖手工维护的 `.env` 文件。这确保了：

- ✅ **无密钥泄漏**: API 密钥永远不会出现在代码库中
- ✅ **可重复部署**: 基础设施由代码版本管理
- ✅ **审计追踪**: 所有配置变更都被记录
- ✅ **多环境支持**: 开发、测试、生产可以有不同的密钥和配置
- ✅ **自动化部署**: 通过 CI/CD 集成无缝部署

### 本地开发

本地开发时，仍然使用 `.env` 文件：

```bash
cp .env.example .env
# 仅在本地添加 API 密钥（.env 在 .gitignore 中，不会被提交）
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

### 生产部署（GitHub Secrets + GitHub Actions）

最简单的方案：使用 GitHub Secrets 存储敏感信息，通过 GitHub Actions 自动部署。

**快速设置**：

```bash
# 1. 添加 Secrets 到 GitHub 仓库
gh secret set DATABASE_URL --body "postgresql://..."
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
gh secret set AI_PROVIDER --body "anthropic"
# ... 其他必要的 Secrets

# 2. 推送到 main 分支
git push origin main

# 3. GitHub Actions 自动运行
# 查看运行状态
gh run list
```

详见 [`docs/GITHUB_SECRETS.md`](docs/GITHUB_SECRETS.md) — 完整的 GitHub Secrets 配置指南。

**高级部署方案**：

如果需要多云支持或更复杂的基础设施管理，可以使用 Terraform 或其他 IaC 工具：

- [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) — 完整的 IaC 架构说明（支持 Terraform、Pulumi、Bicep、Kubernetes、Docker）
- [`infra/terraform/`](infra/terraform/) — Terraform 配置文件（AWS）

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
