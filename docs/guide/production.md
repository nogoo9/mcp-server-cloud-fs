# Production Features

Enterprise-grade features for production deployments over HTTP and WebSocket transports.

## Health Checks

HTTP/WS transports expose Kubernetes-convention health endpoints:

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `/healthz` | Liveness — is the process alive? | `200 OK` always | Process is dead |
| `/readyz` | Readiness — can it serve traffic? | `200 OK` after VFS hydration | `503` during startup |

Configure your orchestrator's liveness and readiness probes to use these endpoints.

## Rate Limiting

Token bucket rate limiting protects against abuse. **Disabled by default.**

- **In-memory** — per-IP/per-client counters for single-process deployments
- **Redis** — distributed rate limiting for multi-instance deployments (uses existing optional `ioredis` peer dep)
- Returns `429 Too Many Requests` with `Retry-After` header when limits are exceeded

```bash
# 60 requests/minute with burst of 10
cloud-fs-mcp s3 s3://my-bucket --transport http \
  --rate-limit 60 --rate-limit-burst 10
```

## CORS

Cross-Origin Resource Sharing for browser-based MCP clients:

- Strict origin allowlist — no wildcards in production
- Exposes `Mcp-Session-Id` and `Mcp-Protocol-Version` headers
- Localhost auto-allows `*` when `--host 127.0.0.1` (dev convenience)

```bash
cloud-fs-mcp s3 s3://my-bucket --transport http \
  --cors-origin https://app.example.com \
  --cors-origin https://staging.example.com
```

## Structured Request Logging

JSON audit trail to stderr for compliance and debugging:

```json
{
  "ts": "2026-05-12T12:00:00Z",
  "sessionId": "019...",
  "tool": "read_file",
  "user": "alice@example.com",
  "latencyMs": 42,
  "status": 200
}
```

Enable with `--request-logging`.

## DNS Rebinding Protection

Automatically applied when binding to localhost addresses. Validates the `Host` header against allowed hostnames to prevent DNS rebinding attacks.

## Graceful Shutdown

On `SIGINT` / `SIGTERM`, the server:

1. Stops accepting new connections
2. Waits for in-flight requests to complete
3. Flushes all dirty VFS entries to the storage provider
4. Exits cleanly

This prevents data loss from unflushed writes.
