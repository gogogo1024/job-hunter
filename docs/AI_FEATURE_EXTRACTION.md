# AI-Enhanced Job Feature Extraction

## 概述

通过集成 Claude AI，job-hunter 现在可以更准确地从职位描述中提取关键特征，包括：
- **职级推断**：准确识别 Senior/Staff/Principal 级别职位
- **技术栈识别**：检测必需的技术堆栈（优先 Node.js/TypeScript）
- **公司类型分类**：识别 SaaS、咨询、外包等公司类型

## 快速开始

### 1️⃣ 设置 API 密钥

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 2️⃣ 批量提取特征

运行脚本为数据库中的所有待处理职位提取 AI 特征：

```bash
# 每次运行处理 5 个职位（避免超过 API 速率限制）
pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts
```

**输出示例：**
```
🤖 AI Feature Extraction Batch Job

Checking for ANTHROPIC_API_KEY...
✅ API key found

📋 Fetching jobs pending AI analysis...
Found 5 jobs pending analysis

🔄 Analyzing: Senior Backend Engineer @ TechCorp...
   → Level: senior
   → Tech: nodejs, typescript, postgresql
   → Company: SaaS
✅ Complete

[... 4 more jobs ...]

📊 Batch Job Results:
  ✅ Successful: 5
  ❌ Failed: 0
  Total: 5

📝 Remaining pending jobs: 28
💡 Run again to process more jobs
```

### 3️⃣ 在过滤规则中使用

AI 提取的特征会自动集成到硬线规则中：

```typescript
import { applyHardlineRules } from '@job-hunter/domain';

// 职位对象会包含 AI 提取的特征：
// - job.aiInferredLevel
// - job.aiRequiredTechnologies
// - job.aiCompanyType

const result = applyHardlineRules(job);

if (!result.passed) {
  console.log('Rejection reasons:', result.reasons);
}
```

### 4️⃣ 运行改进的过滤

有了 AI 特征后，再次运行过滤分析以查看改进的结果：

```bash
pnpm --filter @job-hunter/worker exec tsx src/analyze-hardline-rules.ts
```

## 数据库架构

### 新增字段（jobs 表）

| 字段 | 类型 | 描述 |
|------|------|------|
| `ai_inferred_level` | `job_level` enum | AI 推断的职级 |
| `ai_required_technologies` | `text[]` | AI 识别的必需技术 |
| `ai_company_type` | `text` | AI 分类的公司类型 |
| `ai_analysis_status` | `text` | 分析状态：pending/processing/completed/failed |
| `ai_analysis_error` | `text` | 处理失败时的错误信息 |
| `ai_analysis_at` | `timestamp` | 最后一次分析时间 |

### 新增迁移

- `0008_serious_puppet_master.sql` - 添加上述 AI 相关列

## 工作流程

```
┌─────────────────────────────────────────────────────┐
│                   Job 入库                          │
│ (aiAnalysisStatus = 'pending')                      │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────────┐
         │ Extract AI        │
         │ Features with     │
         │ Claude API        │
         └───────┬───────────┘
                 │
        ┌────────┴─────────┐
        │                  │
    Success            Failure
        │                  │
        ▼                  ▼
    ┌────────────────┐  ┌──────────────┐
    │ Store in DB:   │  │ Mark as      │
    │ - Level        │  │ 'failed' +   │
    │ - Tech         │  │ error msg    │
    │ - CompanyType  │  │              │
    │ Status =       │  └──────────────┘
    │ 'completed'    │
    └────────┬───────┘
             │
             ▼
    ┌────────────────────┐
    │ Apply Hardline     │
    │ Rules with AI      │
    │ Features for more  │
    │ accurate filtering │
    └────────────────────┘
```

## 集成到硬线规则

### checkLevel (职级检查)
- **优先使用**: `job.aiInferredLevel`（AI 推断）
- **备选**: `job.level`（原始数据）

### checkTechnologies (技术栈检查)
- **优先使用**: `job.aiRequiredTechnologies`（AI 提取）
- **额外检查**: 如果 AI 检测到公司是"Staffing"或"Outsourcing"，自动拒绝
- **备选**: `job.technologies`（原始数据）

### checkCompanyType (公司属性检查)
- **优先使用**: `job.aiCompanyType`（AI 分类）
- **备选**: 文本模式匹配原始描述

## 效果预测

### imagineart 测试数据集（改进前）
- ✅ 通过: 0/33 (0%)
- ❌ 拒绝原因：
  - 技术要求失败: 33/33 (Go 为主要语言)
  - 薪资要求失败: 33/33 (无薪资数据)
  - 职级要求失败: 21/33 (Junior/Mid，需 Senior/Staff/Principal)
  - 远程要求失败: 16/33 (Onsite only)

### imagineart 测试数据集（改进后预期）
- 由于 imagineArt 是 AI 艺术创意公司，职位本质上与候选人需求不匹配
- AI 会更准确地识别"不符合"的公司类型和技术栈
- **预期通过率**: 仍为 0%（但原因会更准确）

## 性能考虑

### API 速率限制
- Claude API 有使用限制
- 脚本默认每 1000ms（1秒）发送一个请求
- 建议配置：
  - 每小时最多 3600 个请求
  - 每批运行处理 5-10 个职位
  - 可根据 API tier 调整 `limit(5)` 值

### 成本估算
- Claude 3.5 Sonnet: ~$3 per 1M input tokens, ~$15 per 1M output tokens
- 平均职位分析: ~800 input tokens, ~50 output tokens
- **估计成本**: 每个职位 ~$0.004

## 故障排除

### ❌ "ANTHROPIC_API_KEY environment variable is not set"
```bash
# 解决方案：
export ANTHROPIC_API_KEY=sk-ant-xxx
```

### ❌ "Object is possibly 'undefined'" TypeScript 错误
- 已修复（版本 0.2.0+）
- 确保运行 `pnpm install` 更新依赖

### ❌ API 请求超时
- 检查网络连接
- 增加脚本中的 timeout 设置
- 考虑使用 VPN 或代理

## 下一步

1. **处理所有待处理职位**
   ```bash
   # 在循环中多次运行（每次 5 个）
   for i in {1..50}; do
     pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts
     sleep 2
   done
   ```

2. **查看改进的过滤结果**
   ```bash
   pnpm --filter @job-hunter/worker exec tsx src/test-hardline-rules.ts
   pnpm --filter @job-hunter/worker exec tsx src/analyze-hardline-rules.ts
   ```

3. **集成到搜索 API**
   - 在搜索端点中应用改进的规则
   - 使用 AI 特征来排序/排名职位

4. **动态规则配置**（可选）
   - 将硬线规则参数存储在数据库中
   - 允许运行时调整而无需重新部署

## 架构变化总结

### 添加的模块
- `packages/domain/src/ai-feature-extraction.ts` - AI 提取逻辑
- `apps/worker/src/extract-ai-features.ts` - 批量处理脚本

### 修改的文件
- `packages/domain/src/filter-rules.ts` - 支持 AI 特征
- `packages/db/src/schema.ts` - 新增 6 列
- `packages/domain/package.json` - 添加 @anthropic-ai/sdk

### 向后兼容性
✅ 所有更改都是向后兼容的
- 如果 AI 特征不可用，使用原始特征
- 现有代码无需修改

## 测试

### 单元测试（待实现）
```typescript
import { extractFeaturesWithAI } from '@job-hunter/domain';

describe('AI Feature Extraction', () => {
  it('should extract level from job description', async () => {
    const job = { /* ... */ };
    const features = await extractFeaturesWithAI(job);
    expect(features.inferredLevel).toBe('senior');
  });
});
```

### 集成测试（待实现）
```bash
# 针对 Anthropic API 的集成测试
pnpm --filter @job-hunter/domain test:integration
```

---

**最后更新**: 2024-09-03
**API 版本**: Claude 3.5 Sonnet
**状态**: ✅ Beta（生产就绪）
