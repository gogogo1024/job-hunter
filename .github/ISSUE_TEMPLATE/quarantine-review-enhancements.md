---
name: Quarantine review — 扩展审计 / Web UI / Slack 告警
about: 在 Quarantine / 审查流程中补强 accept 审计历史、提供 Web 审查界面，并同时推 Slack 告警
title: "[Enhancement] Quarantine review: accept 审计扩展、Web 审查 UI、Slack 告警"
labels: enhancement,quarantine,review
assignees: []
---

## 背景
当前同步流程已实现：
- 对每次抓取写入 `job_snapshots` 与 `job_snapshot_diffs`（审计）；
- 在整轮同步可疑时导出 CSV 并短期标记 `__quarantine`，并支持通过 Resend 发邮件告警；
- 提供简易 CLI `quarantine-review` 支持 `list / accept / reject`。

接下来希望把三项能力进一步健全并产出可操作流程：
1. 把 `accept` 的审计记录扩展为更完整的历史（便于追踪谁、何时、以何种规则接受了隔离并如何合并字段）；
2. 把 Quarantine 审查做成一套 Web 界面，方便非 CLI 的人工复核与批量操作；
3. 在现有 Resend 邮件告警外，同时推送 Slack 告警以便及时提醒并快速跳转到审查界面。

## 建议功能（概要）

1) 扩展 `accept` 审计记录
- 在数据库 `quarantine_reviews` 表中记录完整信息：
  - `id`, `jobId`, `jobSnapshotId`, `runId`, `action` (accept/reject), `reviewer` (用户名或 id)，`method` (cli|web|api)，`acceptedFields` (json array)，`previousValues` (json object，仅包含被覆盖/保留的字段)，`diff` (json)，`anomalyScore` (int)，`notes`，`createdAt`。
- 在 `packages/db/src/repository.ts` 的 `accept` 分支写入此记录；同时为 `jobId`、`createdAt` 建索引便于查询。 

2) Quarantine 审查 Web 界面（最小可交付 MVP）
- 放置在 `apps/web`（或新增 `apps/quarantine-ui`）：
  - 页面：未审查列表（按 run/board 过滤）、单条详情（显示 snapshot、diff、prev/raw、reasons、score）、批量接受/拒绝、导出 CSV。
  - 后端 API：`GET /api/quarantine?runId=...`、`GET /api/quarantine/:jobId`、`POST /api/quarantine/:jobId/accept`、`POST /api/quarantine/:jobId/reject`。
  - 权限：基于现有项目 Auth（或简单的 env ADMIN_TOKEN）保护接口。
  - 可选增强：为每条 job 提供“查看历史 diffs”面板和“回滚/恢复”按钮。

3) Slack 告警
- 支持两种模式：简单 webhook（`SLACK_WEBHOOK_URL`）或 Slack App（Bot token + signing secret）。
- 告警内容：sync run id、board、predicted changed、ratio、anomaly score、CSV 下载链接（或 Web UI 链接）、快速操作按钮（跳转到审查页）。
- 在 `apps/worker/src/sync-ashby.ts` 中，当判定为 suspicious 时同时触发 Slack 通知（并记录发送状态）。

## 验收标准
- `quarantine_reviews` 表能记录并查询每次 accept/reject 的完整历史（包括 acceptedFields 与 previousValues）。
- Web UI 能列出当前待审查项，查看详情并能以带备注的方式 accept/reject；accept 会在 DB 记录历史并执行字段级合并。
- 当 sync 被标记为 suspicious：
  - 生成的 CSV 可在邮件中或 UI 中下载；
  - Slack 能收到告警并包含审查跳转链接；
- 单元/集成测试覆盖关键后端逻辑（accept 合并、审计记录写入、Slack/Resend 调用为可 mock）。

## 实施步骤（建议顺序）
1. 扩展 `quarantine_reviews` 表 schema：加入 `runId`, `acceptedFields`, `previousValues`, `diff`, `anomalyScore`, `method` 等列，并生成 drizzle migration。
2. 修改 `apps/worker/src/quarantine-review.ts`：在 accept 成功后写入完整审计记录（兼容 CLI 参数里的 reviewer/notes）。
3. 在 `packages/db/src/repository.ts` 抽出或完善 `recordQuarantineReview()` helper，供 CLI / API / UI 调用。
4. 新建后端 API 层（如 `apps/mcp-server` 或 `apps/worker` 的小 http handler），实现审查相关接口并做好权限校验。
5. 在 `apps/web` 中实现简单审查 UI（列表、详情、接受/拒绝），并为 accept 调用后端 API。
6. 集成 Slack：支持 webhook + Slack app 两种方式；实现发送模板并在 UI 上显示发送状态。
7. 完成迁移、测试、以及 README / 运维说明（环境变量、权限、如何手动运行审查）。

## 实施影响与注意事项
- 数据库迁移需谨慎：`quarantine_reviews` 表扩展涉及 JSON/文本字段；请先生成 migration 并在测试环境验证。 
- accept 的字段级合并规则需明确定义并覆盖边界情况（例如：如何合并 locations 数组、如何处理 partial-address）；建议先实现保守策略（在检测到“被移除”时保留旧值），然后根据反馈调整。 
- Slack 告警若使用交互按钮需要额外的 endpoint 处理交互 payload（签名验证、回应动作）。

## 参考文件（当前实现点）
- `packages/db/src/repository.ts` — upsert/accept、canonicalize、detectSuspiciousChange
- `packages/db/src/schema.ts` — jobs / job_snapshots / job_snapshot_diffs / quarantine_reviews
- `apps/worker/src/sync-ashby.ts` — 同步与可疑检测、CSV 导出、Resend 邮件
- `apps/worker/src/quarantine-review.ts` — CLI 实现（list/accept/reject）

## 估算
- 初始 MVP（后端 + 简单 UI + Slack webhook）：约 2–3 天
- 完整版（Slack app 交互、细粒度权限、测试与硬化）：约 4–7 天

---
如果你同意，我可以：
- 直接把本 issue 转为 GitHub issue（需要 repo 的 GitHub 权限），或
- 仅把 issue 草稿保存在仓库（当前已保存为本模板），供你手动创建/调整。
