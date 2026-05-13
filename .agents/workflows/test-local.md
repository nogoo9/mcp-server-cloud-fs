---
description: Run all local lint and tests (no infra required)
---

// turbo-all

Run all lint and test checks that do **not** require infrastructure (Docker, Redis, MinIO, etc.). These should always pass before any commit or PR.

## Step 1 — Lint & format

```bash
bun run format
```

Biome auto-fixes style issues. If it reports **errors** (not warnings), stop and fix them before continuing.

## Step 2 — Type checking

```bash
bun run typecheck
```

TypeScript compiler in no-emit mode. Any type error is a hard failure — stop and fix before continuing.

## Step 3 — Unit tests

```bash
bun test
```

Covers: cache backends, providers (mocked), tool handlers, auth, middleware, path-utils, VFS. All 291 tests should pass. If any fail, note the test file and failing assertion and fix before continuing.

## Step 4 — HTTP & WebSocket E2E tests (no infra)

```bash
bun run test:e2e:http
```

End-to-end tests for the HTTP and WebSocket transports using an in-memory provider. No Docker required. Timeout: 30 s per test.

## Step 5 — Docs build

```bash
bun run docs:build
```

Ensures the VitePress documentation builds cleanly — catches broken links, missing images, and invalid frontmatter. Fix any errors before treating the run as passing.

## Summary

All five steps must pass for the run to be considered clean. Report:
- ✅ Pass or ❌ Fail for each step
- Number of tests passed / failed / skipped from `bun test`
- Any warnings worth noting even if not blocking
