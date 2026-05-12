---
description: Run all local lint and tests (no infra required)
---

// turbo-all

Run all basic lint and test checks that do not require infrastructure (Docker, Redis, etc.):

```bash
bun run format
```

```bash
bun run typecheck
```

```bash
bun test
```

```bash
bun run test:e2e:http
```

```bash
bun run docs:build
```
