# 设计要点

本文档记录项目的设计原则与实现建议，包含为何在 Ashby 稳定后再接 Greenhouse/Lever、数据源抽象与事件驱动同步等要点。

## 为什么现在再接 Greenhouse / Lever

为什么？ 因为现在的管线已经稳定：

```text
Ashby
 |
 Normalizer
 |
 Job
```

在这种设计下，新增数据源的正确姿势是接入新的 Provider，走同一套 Normalizer：

```text
Greenhouse
 |
 Normalizer
 |
 Job
```

而不是为了一个新数据源去重新设计数据库或改变 `Job` 模型：

```text
Greenhouse
 |
 重新设计数据库
```

这样可以保证数据模型稳定、归一化逻辑可复用，并减少迁移风险。

## 最能体现 Staff 级能力的方向

不是写更多 CRUD，而是做好两件事：数据源抽象与事件驱动同步。

### 数据源抽象

建议引入统一的 `JobProvider` 抽象，至少包含拉取与标准化两个职责：

```ts
interface JobProvider {
  // 拉取原始岗位数据（来自第三方 API）
  fetchJobs(): Promise<unknown[]>

  // 将原始数据规范化为共享的 `Job` 模型
  normalize(raw: unknown): Job[]
}
```

然后为每个数据源实现具体的 Provider：

- `AshbyProvider`
- `GreenhouseProvider`
- `LeverProvider`

每个 Provider 负责和上游 API 的交互与最小范围的字段映射，真正的规范化与业务规则放在 `Normalizer` / `packages/domain` 层，保证一致性。

### 事件驱动同步（Event-driven sync）

岗位变更应当发出领域事件（例如 `JobChanged`），而不是在同步流程里直接调用若干后续系统。事件可以由多个消费者并发处理：

```text
JobChanged Event

       |
       +-- update search index
       |
       +-- generate embedding
       |
       +-- notify user
```

优点：解耦、可扩展、易于加速（批处理/并发）、便于观测与重放。

### 实现建议

- 先稳定 `Job` 模型与 Normalizer 的验证逻辑（Zod schema 在 `packages/schema` 已有基础）。
- 在 `apps/worker` 中把 Provider 逻辑模块化，每个 Provider 只负责 fetch + 最初映射。
- 引入事件总线（简单实现可以用 Postgres 的通知、Redis Stream 或 Kafka），事件消费者订阅 `JobChanged` 执行索引/embedding/通知等工作。
- 编写端到端的集成测试，确保 `AshbyProvider` → `Normalizer` → `Job` 的链路可回放，再逐步接入 `GreenhouseProvider`、`LeverProvider`。

这就是将项目从「数据采集」升级为「AI Job Intelligence 平台」的关键路径。
