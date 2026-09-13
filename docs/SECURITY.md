# Security Guidelines

## API Key Management

### ⚠️ Critical Rules

1. **Never commit `.env` to git**
   - The `.gitignore` file already excludes `.env` and `.env.*.local`
   - Only `.env.example` (with placeholder values) should be committed
   - Double-check before every commit: `git status | grep .env`

2. **Never hardcode API keys in source code**
   - All sensitive data must come from environment variables
   - Use `.env` file locally
   - Use environment-based secret management in production

3. **Rotate keys regularly**
   - API keys should be rotated periodically
   - If a key is exposed, revoke it immediately on the provider platform

### Local Development

```bash
# 1. Copy template
cp .env.example .env

# 2. Edit .env with your real API keys
# ⚠️  This file is in .gitignore and will never be committed
nano .env

# 3. Verify .env is ignored
git status
# Should NOT show .env in the output

# 4. Run with the environment variables
pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts
```

### Supported AI Providers

#### Anthropic (Claude)
- Get key from: https://console.anthropic.com/account/keys
- Environment variable: `ANTHROPIC_API_KEY`
- Default model: `claude-3-5-sonnet-20241022`
- Rate limit: Check Anthropic's pricing page

#### Google (Gemini)
- Get key from: https://aistudio.google.com/app/apikey
- Environment variable: `GOOGLE_API_KEY`
- Default model: `gemini-1.5-flash`
- Rate limit: Check Google's pricing page

#### OpenAI (GPT)
- Get key from: https://platform.openai.com/account/api-keys
- Environment variable: `OPENAI_API_KEY`
- Default model: `gpt-4o-mini`
- Rate limit: Check OpenAI's pricing page

### Production Deployment

Choose **one** of the following approaches based on your infrastructure:

#### Option 1: Environment Variables (Recommended)
```bash
# In your deployment platform (GitHub Actions, Docker, Kubernetes, etc.)
export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=<secret-from-vault>
pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts
```

#### Option 2: GitHub Secrets (for CI/CD)
```yaml
# .github/workflows/ai-extraction.yml
env:
  AI_PROVIDER: anthropic
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

#### Option 3: Secret Management System (Recommended for Enterprise)
- **AWS Secrets Manager**: Store keys in AWS, retrieve at runtime
- **HashiCorp Vault**: Centralized secret management
- **GitHub Secrets**: For GitHub Actions workflows
- **Docker Secrets**: For Docker Swarm/Compose
- **Kubernetes Secrets**: For Kubernetes deployments

#### Option 4: Configuration as Code (for cloud platforms)
```bash
# Using environment-specific configuration
# Never commit secrets, only configuration structure

# In CI/CD pipeline:
aws secretsmanager get-secret-value --secret-id job-hunter/anthropic-key \
  | jq -r '.SecretString' | jq -r '.api_key'
```

### Checking for Accidental Commits

```bash
# Search git history for common API key patterns
git log --all --source --remotes -p | grep -E "sk-ant|ANTHROPIC_API_KEY" | head

# If found, the key must be rotated immediately
# Consider using git-secrets or Husky pre-commit hooks
```

### Pre-commit Hook (Optional)

Add this to `.husky/pre-commit` to prevent accidental commits:

```bash
#!/bin/sh
if git diff --cached | grep -E "ANTHROPIC_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY"; then
  echo "❌ Error: API keys detected in staged files!"
  echo "Never commit .env to git"
  exit 1
fi
```

### Audit Trail

Monitor API usage and costs:

1. **Anthropic Dashboard**: https://console.anthropic.com/
2. **Google Cloud Console**: https://console.cloud.google.com/
3. **OpenAI Dashboard**: https://platform.openai.com/account/usage

Set up billing alerts to catch unexpected usage spikes.

## Environment Variable Validation

The system validates configuration at startup:

```bash
$ pnpm --filter @job-hunter/worker exec tsx src/extract-ai-features.ts

❌ Error: API key not found for provider 'anthropic'. 
   Set ANTHROPIC_API_KEY environment variable

# Fix: Set the missing key
export ANTHROPIC_API_KEY=sk-ant-...
```

## Testing Without Real Keys

Use placeholder keys for testing imports and compilation:

```bash
# Validate configuration structure (no API calls)
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=test-key \
  pnpm exec tsx scripts/test-ai-provider.ts

# Output: ✅ All provider tests passed!
```

## Emergency: Key Compromise

If a key is accidentally exposed:

1. **Immediately revoke the key** on the provider platform
2. **Generate a new key**
3. **Update all systems** with the new key
4. **Search git history**: `git log --all -p | grep <compromised-key>`
5. **Force-push to remove**: Use `git-filter-branch` or `BFG Repo-Cleaner` (carefully!)
6. **Notify the security team** if this is an organization

## References

- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [CWE-798: Use of Hard-Coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- [GitGuardian: How to Handle Secrets in Git](https://www.gitguardian.com/blog/how-to-handle-secrets-in-git)
