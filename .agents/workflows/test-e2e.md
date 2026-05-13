---
description: Conduct e2e test with a provisioned docker compose
---

# E2E Test Workflow

Full end-to-end test suite, including infra-backed tests that require Docker. Always run the local suite (`/test-local`) first — only proceed here if those pass.

## Step 1 — HTTP & WebSocket E2E (no infra)

```bash
bun run test:e2e:http
```

Covers HTTP and WebSocket transports with an in-memory provider. No Docker needed. If this fails, stop — the issue is in transport logic, not infra.

## Step 2 — Start infrastructure

```bash
bun run infra:up
```

Starts MinIO (S3-compatible) and Redis via Docker Compose (`infra/docker-compose.yml`).

## Step 3 — Wait for services to be healthy

Poll until both services are ready before running tests:

**MinIO** (allow up to 30 s):
```bash
curl -sf http://localhost:9000/minio/health/live
```

**Redis** (allow up to 30 s):
```bash
bun -e "const r = new (await import('ioredis')).default(); await r.ping(); r.disconnect(); console.log('Redis OK')"
```

If either service fails to become healthy within 30 s, run `bun run infra:logs` to inspect errors, then stop.

## Step 4 — Infra E2E tests

```bash
bun run test:e2e:infra
```

Covers `src/server.e2e.test.ts` — full server E2E over STDIO with MinIO + Redis backends. Timeout: 30 s per test.

## Step 5 — Provider integration tests (optional)

Only run if provider code (`src/providers/`) was modified:

```bash
bun run test:integration
```

Covers S3, Azure (Azurite), and GCS (fake-gcs-server) providers against their emulators.

## Step 6 — Tear down infrastructure

Always tear down, even if tests failed:

```bash
bun run infra:down
```

## Summary

Report for each step:
- ✅ Pass or ❌ Fail
- Number of tests passed / failed / skipped
- Service health status (Step 3)
- Any test output worth noting for triage

If any step fails, include the first failing test name and error message to help with diagnosis.