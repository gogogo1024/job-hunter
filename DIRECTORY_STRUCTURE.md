# 项目目录结构 🗂️

## 快速导航

```
job-hunter/
├── 📁 apps/                     # 应用程序
│   ├── api/                     # 求职 API 服务
│   ├── mcp-server/              # MCP 服务器
│   ├── web/                     # Web 前端
│   └── worker/                  # 后台任务处理
├── 📁 packages/                 # 共享库
│   ├── db/                      # 数据库 ORM (Drizzle)
│   ├── domain/                  # 业务逻辑 (硬线规则, AI 特征提取)
│   ├── integrations/            # 第三方集成 (Ashby, LinkedIn 等)
│   ├── notifications/           # 通知模块
│   ├── schema/                  # 数据 Schema 定义
│   └── shared/                  # 共享类型和工具
├── 📁 infra/                    # 基础设施配置
│   └── compose.yaml             # Docker Compose (PostgreSQL)
├── 📁 docs/                     # 📚 文档 (新增)
│   ├── README.md                # 项目主 README
│   ├── AI_FEATURE_EXTRACTION.md # AI 特征提取使用指南
│   ├── IMPLEMENTATION_SUMMARY.md# AI 模块实现细节
│   ├── construct.md             # 项目构造文档
│   ├── doubao.md                # 硬线规则规范
│   ├── requiredment.md          # 需求文档
│   └── job-process.md           # 职位处理流程
├── 📁 scripts/                  # 🔧 脚本工具 (新增)
│   ├── debug-ashby-api.mjs      # Ashby API 调试脚本
│   ├── test-ashby-api.mjs       # Ashby API 测试
│   ├── test-ashby-filter.mjs    # 过滤器测试
│   ├── test-ashby-integration.mjs # 集成测试
│   ├── query-jobs.mjs           # 查询职位脚本
│   └── demo-ai-extraction.sh    # AI 特征提取演示
├── 📁 PR_NOTES/                 # PR 相关笔记
├── 📁 .github/                  # GitHub 配置
├── 📁 .vscode/                  # VS Code 配置
│
├── 📄 package.json              # 工作区配置
├── 📄 pnpm-workspace.yaml       # pnpm 工作区定义
├── 📄 pnpm-lock.yaml            # 依赖锁定文件
├── 📄 tsconfig.json             # TypeScript 配置
├── 📄 tsconfig.base.json        # 基础 TypeScript 配置
├── 📄 turbo.json                # Turborepo 配置
├── 📄 .env.example              # 环境变量模板
├── 📄 .gitignore                # Git 忽略规则
└── 📄 README.md                 # 项目简介
```

---

## 📂 详细说明

### `apps/` - 应用程序

| 目录 | 说明 |
|-----|------|
| `api/` | RESTful API 服务，用于搜索和管理职位 |
| `mcp-server/` | MCP (Model Context Protocol) 服务器 |
| `web/` | Web 前端应用 |
| `worker/` | 后台任务处理（数据同步、AI 分析、规则应用） |

### `packages/` - 共享库

| 目录 | 说明 |
|-----|------|
| `db/` | Drizzle ORM 数据库层（Schema、迁移、查询） |
| `domain/` | 🤖 核心业务逻辑：8 条硬线规则 + AI 特征提取 |
| `integrations/` | 第三方 API 集成（Ashby、LinkedIn、Greenhouse 等） |
| `notifications/` | 邮件、Slack 等通知模块 |
| `schema/` | 数据 Schema 定义（职位、用户、应用等） |
| `shared/` | 共享类型定义、常量、工具函数 |

### `docs/` - 📚 文档 (新增)

整合所有项目文档，便于查找和维护：
- **AI_FEATURE_EXTRACTION.md** - Claude AI 特征提取完整指南
- **IMPLEMENTATION_SUMMARY.md** - AI 模块架构和实现细节
- **construct.md** - 项目初期构造和计划
- **doubao.md** - 8 条硬线过滤规则的详细规范
- **requiredment.md** - 业务需求文档
- **job-process.md** - 职位数据处理流程

### `scripts/` - 🔧 脚本工具 (新增)

实用脚本集合，便于快速测试和开发：
- **debug-ashby-api.mjs** - 调试 Ashby API 响应
- **test-ashby-*.mjs** - 各种测试脚本
- **query-jobs.mjs** - 数据库查询工具
- **demo-ai-extraction.sh** - AI 特征提取工作流演示

---

## 🎯 常用命令

### 构建和开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 全量构建
pnpm build

# 运行测试
pnpm test
```

### 数据库

```bash
# 应用迁移
pnpm --filter @job-hunter/db db:migrate

# 生成迁移
pnpm --filter @job-hunter/db db:generate

# 打开 Drizzle Studio
pnpm --filter @job-hunter/db db:studio
```

### AI 特征提取

```bash
# 设置 API 密钥
export ANTHROPIC_API_KEY=sk-ant-xxx

# 运行批量提取
pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts

# 演示工作流
bash scripts/demo-ai-extraction.sh
```

### 测试脚本

```bash
# 测试 Ashby API
node scripts/test-ashby-api.mjs

# 测试集成
node scripts/test-ashby-integration.mjs

# 查询职位
node scripts/query-jobs.mjs
```

---

## 📖 文档速查

| 文档 | 说明 |
|-----|------|
| `README.md` | 项目概述和快速开始 |
| `README.dev.md` | 开发环境配置 |
| `docs/AI_FEATURE_EXTRACTION.md` | 🤖 AI 特征提取使用指南 |
| `docs/IMPLEMENTATION_SUMMARY.md` | 🏗️ AI 模块架构细节 |
| `docs/doubao.md` | 💼 硬线过滤规则规范 |
| `docs/construct.md` | 📐 项目构造文档 |

---

## 🔄 工作流程

### 新职位入库流程

```
Ashby API
    ↓
[apps/worker] 同步职位
    ↓
[packages/db] 保存到 PostgreSQL
    ↓
[packages/domain] 应用硬线规则
    ↓
[packages/domain] 🤖 AI 特征提取
    ↓
[apps/api] 提供搜索接口
```

---

## 🚀 快速开始

```bash
# 1. 克隆并安装
git clone <repo>
cd job-hunter
pnpm install

# 2. 配置环境
cp .env.example .env
# 编辑 .env 设置数据库 URL 和 API 密钥

# 3. 启动数据库
docker compose -f infra/compose.yaml up -d

# 4. 运行迁移
pnpm --filter @job-hunter/db db:migrate

# 5. 开发模式
pnpm dev

# 6. （可选）AI 特征提取
export ANTHROPIC_API_KEY=sk-ant-xxx
pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts
```

---

## 📝 说明

- **独立脚本** 集中到 `scripts/` 便于管理和发现
- **文档** 集中到 `docs/` 便于查阅（README.md 除外）
- **配置文件** 保留在根目录便于构建工具查找
- **应用和库** 分离在 `apps/` 和 `packages/` 中

此结构遵循 **Monorepo + TypeScript + Node.js** 的最佳实践。

---

**最后更新**: 2026-09-12
