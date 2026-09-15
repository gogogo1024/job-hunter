# GitHub Secrets Configuration

使用 GitHub Secrets 和 GitHub Actions 是最简单的配置和密钥管理方案。适合中小型项目和快速部署。

## 快速开始

### 1. 在 GitHub 仓库中添加 Secrets

进入 Repository Settings → Secrets and Variables → Actions，添加以下 Secrets：

| Secret 名称 | 说明 | 示例 |
|-----------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:password@db.example.com:5432/job_hunter` |
| `ASHBY_JOB_BOARD` | Ashby job board 名称 | `my-company-careers` |
| `AI_PROVIDER` | AI 提供商选择 | `anthropic` 或 `google` 或 `openai` |
| `ANTHROPIC_API_KEY` | Claude API 密钥 | `sk-ant-...` |
| `GOOGLE_API_KEY` | Gemini API 密钥 | `AIzaSy...` |
| `OPENAI_API_KEY` | GPT API 密钥 | `sk-proj-...` |

### 2. 使用 GitHub CLI 添加 Secrets（推荐）

```bash
# 登录 GitHub
gh auth login

# 添加 Secrets
gh secret set DATABASE_URL --body "postgresql://..."
gh secret set ASHBY_JOB_BOARD --body "my-company"
gh secret set AI_PROVIDER --body "anthropic"
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
gh secret set GOOGLE_API_KEY --body ""  # 可以留空如果不使用
gh secret set OPENAI_API_KEY --body ""   # 可以留空如果不使用
```

### 3. 验证 Secrets 已添加

```bash
# 列出所有 Secrets（不显示值）
gh secret list
```

## 工作流说明

`.github/workflows/deploy-with-secrets.yml` 工作流会：

1. 推送到 `main` 分支时自动触发
2. 安装依赖（Node.js + pnpm）
3. 构建所有包
4. 运行测试
5. 使用 GitHub Secrets 中的密钥运行 AI 特征提取
6. 同步 Ashby 数据

### 工作流执行

```bash
# 查看工作流日志
gh run list --repo <owner>/<repo>

# 查看最新运行的详情
gh run view <run-id>

# 查看特定 step 的日志
gh run view <run-id> --log
```

## 本地开发仍然使用 .env

```bash
cp .env.example .env
# 在 .env 中手动添加本地开发的密钥（不会被提交）
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
echo "DATABASE_URL=postgresql://..." >> .env
echo "ASHBY_JOB_BOARD=..." >> .env
```

## 安全最佳实践

### ✅ 安全做法

1. **Never commit .env file**
   ```bash
   # 已在 .gitignore 中
   .env        # ← 不会被提交
   .env.*      # ← 不会被提交
   !.env.example  # ← 这个会提交（无敏感信息）
   ```

2. **Secrets in GitHub only**
   - 所有敏感信息只存储在 GitHub Secrets
   - 工作流自动注入到环境变量
   - 日志中不会显示敏感值

3. **Rotate keys regularly**
   ```bash
   # 更新 GitHub Secrets
   gh secret set ANTHROPIC_API_KEY --body "sk-ant-NEW-KEY"
   
   # GitHub Actions 会自动使用新密钥
   # 下次工作流运行时生效
   ```

4. **Audit secret access**
   - GitHub 记录所有 Secrets 的访问
   - 查看 Action runs 的日志历史
   - 设置 branch protection 防止直接提交到 main

### ❌ 避免做法

```bash
# ❌ 不要这样做
DATABASE_URL="postgresql://..." git push
echo $ANTHROPIC_API_KEY >> .env && git commit

# ❌ 不要把密钥放在工作流文件中
env:
  ANTHROPIC_API_KEY: "sk-ant-..."  # 永远不要!

# ❌ 不要打印敏感信息到日志
run: echo "Key is: ${{ secrets.ANTHROPIC_API_KEY }}"
```

## 手动运行工作流

如果需要手动运行工作流（不等待 push）：

```bash
# 触发工作流
gh workflow run deploy-with-secrets.yml --ref main

# 查看实时日志
gh run list --workflow=deploy-with-secrets.yml -L 1
gh run view <run-id> --log
```

## 故障排除

### 问题：工作流报错找不到密钥

```
Error: The following secrets are not set: ANTHROPIC_API_KEY
```

**解决方案**：
```bash
# 检查 Secrets 是否存在
gh secret list

# 如果不存在，添加它
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
```

### 问题：数据库连接失败

```
Error: FATAL: password authentication failed for user "..."
```

**解决方案**：
1. 验证 `DATABASE_URL` 正确
2. 确保数据库实例可以被 GitHub Actions 访问
3. 检查防火墙/安全组规则

### 问题：测试失败

```bash
# 查看完整日志
gh run view <run-id> --log > run-log.txt

# 在本地复现
ANTHROPIC_API_KEY="..." pnpm test
```

## 与其他 IaC 的比较

| 方案 | 优点 | 缺点 | 何时使用 |
|-----|------|------|---------|
| **GitHub Secrets** | 简单、无额外基础设施、GitHub Actions 原生支持 | 仅限 GitHub 生态、无跨云支持 | 小型项目、快速启动 |
| **Terraform** | 多云支持、完整基础设施定义、状态管理 | 学习曲线、需要维护 tfstate | 生产级、多环境复杂部署 |
| **Pulumi** | 代码即基础设施、支持多种语言 | 维护成本、状态管理 | 大型项目、团队开发 |
| **Docker Secrets** | 容器原生、Swarm/K8s 支持 | 需要容器化、额外复杂度 | 容器部署、K8s 环境 |

当前建议：**GitHub Secrets 快速启动** → 后期迁移到 **Terraform** 如需多环境或多云

## 迁移到 Terraform

当项目成长时，可以迁移到 Terraform：

```bash
# Terraform 方案在 infra/terraform/ 中
cd infra/terraform

# 初始化 Terraform
terraform init

# 使用 GitHub Secrets 中相同的密钥
terraform plan \
  -var="anthropic_api_key=$ANTHROPIC_API_KEY" \
  -var="database_url=$DATABASE_URL"
```

详见 `/docs/INFRASTRUCTURE.md` 中的 Terraform 部分。

## 参考

- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [GitHub CLI Secret Commands](https://cli.github.com/manual/gh_secret)
- [Securing secrets in workflows](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
