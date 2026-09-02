那就继续把这个产品的核心形态定下来。

我建议它的第一版不是“聊天机器人 + 搜索结果”，而是：

> **Chat-first Job Intelligence Agent**

用户始终从聊天开始，但聊天背后是一个结构化、可追踪的求职系统。

### 1. 用户说人话

例如：

> “帮我找加拿大 Staff Backend，Node.js/TS 优先，Go 也行，最低 230K CAD，256K 是目标，Toronto 现场可以，但不能要求我已经有加拿大工签，Java/Python 主栈不要，猎头不要。”

AI 解析成：

```ts
{
  locations: ["Canada"],
  levels: ["Staff"],
  preferredStack: ["Node.js", "TypeScript", "Go"],
  excludedPrimaryStack: ["Java", "Python", "Kotlin"],
   minSalary: { amount: 230_000, currency: "CAD", period: "year" },
  targetBaseCad: 256_000,
  workModes: ["remote", "hybrid", "onsite"],
  requireSponsorship: true,
  excludeRecruiters: true
}
```

### 2. 机械筛选全部交给代码

然后：

```text
招聘源
 ↓
标准化
 ↓
去重
 ↓
硬条件过滤
 ↓
数据库
```

例如：

```ts
filterJob(job, preference)
```

这里**不用 LLM**。

这样速度快、便宜，而且不会今天把 Python 排除，明天又偷偷把 Python 岗位推荐回来。

### 3. 只把“判断题”交给 AI

剩下真正需要推理的才让模型做：

> “这个岗位为什么适合我？”

> “Sentry 和 Tubi 哪个更适合我？”

> “这个 sponsorship 有没有希望？”

> “这家公司是不是实际上外包/猎头？”

> “这个职位虽然写 Platform，会不会其实是纯 Infrastructure？”

这才是 AI 的价值。

---

## 4. 我特别建议做一个“证据系统”

这对你现在的实际需求太重要了。

每一个结论，都保存：

```text
Evidence
├── source
├── url
├── fetchedAt
├── snippet
└── confidence
```

例如：

```text
Sentry
Sponsorship: unknown

Evidence:
- Job description: no sponsorship statement
- Toronto hiring: confirmed
- Other Sentry Canada role: sponsorship mentioned
- Employee immigration role: found

Confidence: 0.68
```

然后用户问：

> “为什么你说 Sentry 可能 sponsor？”

系统能直接把证据展示出来。

这就能彻底避免我们现在这种：

> “我感觉它可能 sponsor”
>
> “等等，这其实只是另一个职位。”

---

# 5. 岗位卡片不要只是展示信息

每张卡都应该有：

```text
Sentry
Senior Software Engineer (Node)

Toronto · Hybrid
CA$200K–295K
Node.js / TypeScript

匹配度：94
薪资：★★★★★
技术：★★★★★
地点：★★★★
签证：？
状态：待投

[查看证据]
[查看完整分析]
[加入待投]
[已申请]
[不考虑]
```

这样你说：

> “这个我投了。”

系统不是让 AI 自己“记住”。

而是：

```text
Application
status = applied
appliedAt = ...
```

---

# 6. 这正好解决我们现在遇到的“记忆问题”

比如：

```text
Job
Sentry / Senior Node
```

和：

```text
Application
Sentry / Senior Node
status = applied
```

完全分开。

然后：

```text
Decision
status = rejected
reason = resume screen
```

也独立记录。

所以不会再出现：

> 公司还活着 ≠ 你还没投
> 岗位还活着 ≠ 你没被拒
> 公司有其他岗位 ≠ 这个岗位还开放

这是这个系统很重要的价值。

---

# 7. 搜索也不应该每次从互联网重新开始

数据库里保存：

```text
firstSeenAt
lastSeenAt
lastChangedAt
closedAt
salaryHistory
descriptionHistory
```

所以系统可以告诉你：

> “Sentry 这个岗位昨天薪资还是 200–295K，今天没变化。”

甚至：

> “Bettermode 在 9 月 3 日把 200K 上限改成了 220K。”

这时候就真正变成 **Job Intelligence** 了。

---

# 8. 最后的 UI 其实很简单

我甚至不建议第一版做复杂 Dashboard。

就三个核心区域：

```text
┌──────────────┬──────────────────────────────┐
│              │                              │
│  Conversations│       Job Detail           │
│              │                              │
│  Today       │  Sentry                     │
│              │  Senior Node SDK             │
│  Canada      │                              │
│  Applied     │  CA$200K–295K               │
│              │  Match 94%                   │
│              │                              │
│              │  Evidence                    │
│              │  Analysis                    │
│              │  Timeline                    │
│              │                              │
└──────────────┴──────────────────────────────┘
```

左边一直是聊天。

右边根据聊天动态打开岗位、公司、申请记录。

---

## 9. 技术架构也就非常清楚了

```text
                    Next.js
                       │
                    tRPC
                       │
                  Node.js API
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Domain        PostgreSQL       AI
        │              │              │
        └──────────────┼──────────────┘
                       │
                    Worker
                       │
             ┌─────────┼─────────┐
             │         │         │
           Ashby   Greenhouse   Lever
                       │
                    MCP API
                       │
                   WorkBuddy
```

其中：

**Web / API / Worker / MCP 全部共享 `packages/domain`、`packages/schema`、`packages/db`。**

这就符合你刚才说的：

> **前后端通用架构。**

---

## 10. 我建议第一阶段只做 4 个能力

不要上来就做一百个功能。

### `search`

> “帮我找加拿大值得投的 Staff Node/TS。”

### `research`

> “Sentry 到底给不给签证？”

### `track`

> “我已经申请 Sentry。”

### `chat`

> “为什么这个岗位比 Tubi 更值得投？”

这四个打通以后，这个东西就已经能用了。

---

而且我觉得这个项目有个很好的副作用：

**它本身就是一个非常完整的 Staff-level 项目案例。**

你以后面试别人问：

> “你做过什么复杂系统？”

你可以直接讲：

**Job Discovery → Normalization → Search → Ranking → Evidence → AI Agent → Event-driven Workers → MCP → Web UI**

这比做一个普通 Todo/Chat App 有意思多了。

下一步最合理的是直接把**领域模型和 monorepo 骨架**定下来，然后先实现第一条真实链路：

> **Ashby API → Job Normalizer → PostgreSQL → `search_jobs` → 聊天结果。**

这样我们很快就能拿你现在正在看的真实职位来跑第一版。

那就继续把这个产品的核心形态定下来。

我建议它的第一版不是“聊天机器人 + 搜索结果”，而是：

> **Chat-first Job Intelligence Agent**

用户始终从聊天开始，但聊天背后是一个结构化、可追踪的求职系统。

### 1. 用户说人话

例如：

> “帮我找加拿大 Staff Backend，Node.js/TS 优先，Go 也行，最低 230K CAD，256K 是目标，Toronto 现场可以，但不能要求我已经有加拿大工签，Java/Python 主栈不要，猎头不要。”

AI 解析成：

```ts
{
  locations: ["Canada"],
  levels: ["Staff"],
  preferredStack: ["Node.js", "TypeScript", "Go"],
  excludedPrimaryStack: ["Java", "Python", "Kotlin"],
   minSalary: { amount: 230_000, currency: "CAD", period: "year" },
  targetBaseCad: 256_000,
  workModes: ["remote", "hybrid", "onsite"],
  requireSponsorship: true,
  excludeRecruiters: true
}
```

### 2. 机械筛选全部交给代码

然后：

```text
招聘源
 ↓
标准化
 ↓
去重
 ↓
硬条件过滤
 ↓
数据库
```

例如：

```ts
filterJob(job, preference)
```

这里**不用 LLM**。

这样速度快、便宜，而且不会今天把 Python 排除，明天又偷偷把 Python 岗位推荐回来。

### 3. 只把“判断题”交给 AI

剩下真正需要推理的才让模型做：

> “这个岗位为什么适合我？”

> “Sentry 和 Tubi 哪个更适合我？”

> “这个 sponsorship 有没有希望？”

> “这家公司是不是实际上外包/猎头？”

> “这个职位虽然写 Platform，会不会其实是纯 Infrastructure？”

这才是 AI 的价值。

---

## 4. 我特别建议做一个“证据系统”

这对你现在的实际需求太重要了。

每一个结论，都保存：

```text
Evidence
├── source
├── url
├── fetchedAt
├── snippet
└── confidence
```

例如：

```text
Sentry
Sponsorship: unknown

Evidence:
- Job description: no sponsorship statement
- Toronto hiring: confirmed
- Other Sentry Canada role: sponsorship mentioned
- Employee immigration role: found

Confidence: 0.68
```

然后用户问：

> “为什么你说 Sentry 可能 sponsor？”

系统能直接把证据展示出来。

这就能彻底避免我们现在这种：

> “我感觉它可能 sponsor”
>
> “等等，这其实只是另一个职位。”

---

# 5. 岗位卡片不要只是展示信息

每张卡都应该有：

```text
Sentry
Senior Software Engineer (Node)

Toronto · Hybrid
CA$200K–295K
Node.js / TypeScript

匹配度：94
薪资：★★★★★
技术：★★★★★
地点：★★★★
签证：？
状态：待投

[查看证据]
[查看完整分析]
[加入待投]
[已申请]
[不考虑]
```

这样你说：

> “这个我投了。”

系统不是让 AI 自己“记住”。

而是：

```text
Application
status = applied
appliedAt = ...
```

---

# 6. 这正好解决我们现在遇到的“记忆问题”

比如：

```text
Job
Sentry / Senior Node
```

和：

```text
Application
Sentry / Senior Node
status = applied
```

完全分开。

然后：

```text
Decision
status = rejected
reason = resume screen
```

也独立记录。

所以不会再出现：

> 公司还活着 ≠ 你还没投
> 岗位还活着 ≠ 你没被拒
> 公司有其他岗位 ≠ 这个岗位还开放

这是这个系统很重要的价值。

---

# 7. 搜索也不应该每次从互联网重新开始

数据库里保存：

```text
firstSeenAt
lastSeenAt
lastChangedAt
closedAt
salaryHistory
descriptionHistory
```

所以系统可以告诉你：

> “Sentry 这个岗位昨天薪资还是 200–295K，今天没变化。”

甚至：

> “Bettermode 在 9 月 3 日把 200K 上限改成了 220K。”

这时候就真正变成 **Job Intelligence** 了。

---

# 8. 最后的 UI 其实很简单

我甚至不建议第一版做复杂 Dashboard。

就三个核心区域：

```text
┌──────────────┬──────────────────────────────┐
│              │                              │
│  Conversations│       Job Detail           │
│              │                              │
│  Today       │  Sentry                     │
│              │  Senior Node SDK             │
│  Canada      │                              │
│  Applied     │  CA$200K–295K               │
│              │  Match 94%                   │
│              │                              │
│              │  Evidence                    │
│              │  Analysis                    │
│              │  Timeline                    │
│              │                              │
└──────────────┴──────────────────────────────┘
```

左边一直是聊天。

右边根据聊天动态打开岗位、公司、申请记录。

---

## 9. 技术架构也就非常清楚了

```text
                    Next.js
                       │
                    tRPC
                       │
                  Node.js API
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Domain        PostgreSQL       AI
        │              │              │
        └──────────────┼──────────────┘
                       │
                    Worker
                       │
             ┌─────────┼─────────┐
             │         │         │
           Ashby   Greenhouse   Lever
                       │
                    MCP API
                       │
                   WorkBuddy
```

其中：

**Web / API / Worker / MCP 全部共享 `packages/domain`、`packages/schema`、`packages/db`。**

这就符合你刚才说的：

> **前后端通用架构。**

---

## 10. 我建议第一阶段只做 4 个能力

不要上来就做一百个功能。

### `search`

> “帮我找加拿大值得投的 Staff Node/TS。”

### `research`

> “Sentry 到底给不给签证？”

### `track`

> “我已经申请 Sentry。”

### `chat`

> “为什么这个岗位比 Tubi 更值得投？”

这四个打通以后，这个东西就已经能用了。

---

而且我觉得这个项目有个很好的副作用：

**它本身就是一个非常完整的 Staff-level 项目案例。**

你以后面试别人问：

> “你做过什么复杂系统？”

你可以直接讲：

**Job Discovery → Normalization → Search → Ranking → Evidence → AI Agent → Event-driven Workers → MCP → Web UI**

这比做一个普通 Todo/Chat App 有意思多了。

下一步最合理的是直接把**领域模型和 monorepo 骨架**定下来，然后先实现第一条真实链路：

> **Ashby API → Job Normalizer → PostgreSQL → `search_jobs` → 聊天结果。**

对，这个阶段的方向是对的，而且**不要现在就上 UI / AI**。

下一步就按这条主线推进：

```text
Ashby API
   ↓
Ingestion Worker
   ↓
Job Normalizer
   ↓
PostgreSQL / Drizzle
   ↓
Change Detection
   ↓
Deterministic Search
   ↓
MCP search_jobs
   ↓
以后再接 Chat / AI
```

### 第二阶段我建议直接做这 6 件事

1. **把 Ashby ingestion 真正跑通**

   * 拉取 job postings
   * `includeCompensation=true`
   * normalize 成统一 `Job`
   * upsert PostgreSQL
   * 记录 `first_seen_at / last_seen_at`
2. **完善 Job 数据模型**
   至少把这些作为一等字段：

   * company
   * title
   * location
   * remote
   * employment type
   * salary min/max/currency
   * technologies
   * department
   * seniority
   * job URL
   * source
   * source job ID
   * status
3. **Change Detection**

   不只是判断“有没有这条职位”，而是能发现：

   * 新职位
   * 职位下线
   * 薪资变化
   * location 变化
   * description 变化
   * remote policy 变化
4. **Deterministic Search**

   先不要 LLM：

   ```text
   search_jobs({
     keywords,
     locations,
     remote,
     seniority,
     minSalary,
     currency,
     technologies,
     source,
     limit
   })
   ```

   搜索结果必须做到**可重复、可解释**。
5. **MCP `search_jobs` 接上真实 DB**

   也就是：

   ```text
   MCP Client
       ↓
   search_jobs
       ↓
   API / domain
       ↓
   PostgreSQL
   ```

   而不是现在的 skeleton 返回 mock。
6. **写 integration tests**

   最少覆盖：

   ```text
   Ashby response
        ↓
   normalized Job
        ↓
   DB
        ↓
   search_jobs
        ↓
   expected results
   ```

---

### 有一个点我尤其建议现在就定下来

**不要让 MCP 直接访问 Drizzle。**

保持：

```text
MCP
 ↓
Application Service
 ↓
Domain
 ↓
Repository
 ↓
Drizzle
 ↓
PostgreSQL
```

这样以后：

```text
Web UI ───────┐
REST API ─────┤
MCP ──────────┤→ Application Service → Domain → Repository
Worker ───────┘
```

四个入口共享同一套业务逻辑。

这对你这个项目特别重要，因为最终真正有价值的不是“做一个招聘网站”，而是把它做成一个**Job Intelligence / Job Search Platform**。后面接 Greenhouse、Lever、公司官网、甚至 AI ranking，都应该只是增加数据源和能力，而不是重新设计核心业务层。

**所以现在最正确的下一步就是：把你现有第一阶段项目拿出来，直接检查并补完 `Ashby → DB → deterministic search → MCP` 这条链。**
