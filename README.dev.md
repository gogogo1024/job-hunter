# 开发指南（Project References + dist 架构）

快速入门：

1. 安装依赖：

```bash
pnpm install
```

2. 首次构建（确保所有包声明文件生成）：

```bash
pnpm -w -r run build
# 或者使用 turbo
pnpm build
```

3. 本地开发：

```bash
pnpm dev
# turbo dev 会并行运行库的 tsc -b -w（持续编译到 dist）和各 apps 的 dev server（比如 tsx watch / next dev）
```

注意：
- 生产/CI 必须先运行 `pnpm -w -r run build`。
- 如果你需要更快的 JS emit，可以考虑将 JS emit 使用 `esbuild/tsup`，同时用 `tsc --emitDeclarationOnly` 生成 `.d.ts`。
