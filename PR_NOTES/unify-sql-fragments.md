# PR 说明 — Centralize raw SQL fragments & unify search/repository logic

本文档随 PR 一并提交，包含更详细的变更清单、迁移/验证说明与审查要点。**不修改 README**，仅作为 PR 附带的审阅与迁移参考。

## 概要
- 将项目中零散的原生 SQL 片段集中到 `@job-hunter/db` 的 helper（`packages/db/src/sql-fragments.ts`），以便统一维护与审查。
- 把可安全替换的内联原生 SQL 用 Drizzle API 或上述 helpers 替换；对必须保留的复杂表达（如 JSONB -> numeric 比较、数组包含运算符 `@>`）集中封装并添加注释与测试覆盖。

## 主要变更（按文件）
- [packages/db/src/sql-fragments.ts](packages/db/src/sql-fragments.ts): 新增。集中保留/封装的 SQL 片段：locations/workModes/technologies ILIKE、JSONB salary 比较、email recipients 包含(`@>`)、attempts 自增表达式等。
- [packages/db/src/search.ts](packages/db/src/search.ts): 使用 helpers 替换重复的 inline SQL；salary 条件由 helper 提供（保留 JSONB->numeric 原语）。
- [apps/mcp-server/src/search-utils.ts](apps/mcp-server/src/search-utils.ts): 同步使用 helpers；为 salary 路径添加单测（apps/mcp-server/src/search-utils.test.ts）。
- [packages/db/src/repository.ts](packages/db/src/repository.ts): 移除对 `pgSql` 的直接使用，改为 Drizzle `update(...).where(...)`；删除 `sql`TRUE`` 的用法；用显式列引用封装原生表达（`${emailJobs.recipients} @> ARRAY[...]`、`${emailJobs.attempts}`）。
- [apps/worker/src/quarantine-review.ts](apps/worker/src/quarantine-review.ts): 在 DB 层用 `orderBy(...).limit(1)` 获取最新 snapshot（避免 JS 端全表排序）。
- [packages/db/src/index.ts]: 导出新的 sql helpers，供其他包导入使用。

## 为什么仍然保留少量原生 SQL
- JSONB 字段中的数字值是字符串（`->>`），需要 cast 到 `numeric` 后比较；Drizzle 的高阶 API 在这类表达上不够简洁或会产出更复杂/不等价的 SQL。直接把这类表达集中到单个 helper 中能兼顾可读性、可审计性与性能。
- 数组包含运算符 `@>`（例如 `recipients @> ARRAY[...]`）是 PostgreSQL 特有且常用于索引；替换为 ORM 表达可能导致无法利用当前索引。

## 迁移与验证步骤（推荐 reviewer/发布前执行）
1. 本地构建与单测

```
pnpm -w -r run build:tsc
pnpm --filter @job-hunter/mcp-server test
pnpm -w -r test   # 可选：运行所有包的测试（若工作区测试覆盖全面）
```

2. 在开发数据库上做采样验证（确保 SQL 语义未被篡改）

设置开发 DB：

```
export DATABASE_URL="postgres://..."
```

示例验证 SQL：

- salary JSONB 条件（替换后仍是同等表达式）：

```
SELECT id, compensation
FROM jobs
WHERE (coalesce((compensation->>'currency')::text, '') = 'CAD')
  AND (
    ((compensation->'base'->>'max')::numeric >= 120000) OR
    ((compensation->'base'->>'min')::numeric >= 120000) OR
    ((compensation->'total'->>'max')::numeric >= 120000) OR
    ((compensation->'total'->>'min')::numeric >= 120000)
  )
LIMIT 5;
```

- recipients 包含测试：

```
SELECT id FROM email_jobs WHERE recipients @> ARRAY['user@example.com']::text[] LIMIT 5;
```

3. 快速行为测试
- 在 dev DB 有代表性数据时，运行 `apps/worker/src/quarantine-review.ts accept <jobId>`（或等价脚本）验证接收流程在 DB 层更新正确。

4. 性能注意
- JSONB->numeric 比较会阻止简单的 B-tree 索引命中；若该查询成为热点，请考虑：
  - 提取重要字段到独立列并建立索引（如 `compensation_base_min_numeric`），或
  - 使用表达式索引（表达式必须与查询完全匹配），或
  - 将频繁查询的维度规范化到列以便索引。

5. 回滚策略
- 最安全的回滚路径：通过 GitHub UI Revert PR（会创建 revert commit）；或者在本地：

```
git checkout feat/unify-sql-fragments
git revert HEAD   # 或 revert 到需要的 commit
git push origin feat/unify-sql-fragments
```

如果要快速恢复主分支状态，也可以在主分支上 revert 相关合入提交。

## 审阅要点清单（Review checklist）
- [ ] 编译通过：`pnpm -w -r run build:tsc`。
- [ ] 单测通过：`pnpm --filter @job-hunter/mcp-server test`（及其他包视需要）。
- [ ] 检查 `packages/db/src/sql-fragments.ts` 中每个 helper 的实现与原先 inline SQL 的语义一致（尤其是 COALESCE 与 cast 规则）。
- [ ] 确认 `packages/db/src/repository.ts` 的更新语句对 `recipients` 与 `attempts` 的表达没有引入边界条件 bug（null/空数组 情况）。
- [ ] 在 dev DB 上用示例 SQL 验证结果一致性。
- [ ] 性能审查：若你熟悉生产查询模式，请评估 JSONB 查询是否可能成为瓶颈并考虑索引策略。

## 其它备注
- PR 作者：本次改动由自动化提交（job-hunter-bot），实现细节请参见变更文件。若希望拆分更小 PR（比如先只做 helper 再改引用），可在审阅时提出分段合并建议。

---
如需我把此文案也同步到 PR 描述正文（而不是单独文件），我可以尝试更新 PR body（需通过 GitHub API）。当前我已把该文件加入 PR，审阅者会在文件变更中看到该指导文档。
