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

## Security Headers

Opt-in HTTP response hardening via **[nosecone](https://github.com/arcjet/arcjet-js/tree/main/nosecone)** (by [Arcjet](https://arcjet.com)). This framework-agnostic middleware attaches security response headers to **every response path** — health checks, MCP JSON-RPC messages, preflight OPTIONS, and 404s — so there are no gaps.

```bash
# Enable with nosecone defaults
cloud-fs-mcp s3 s3://my-bucket --transport http --security-headers
```

### Headers Applied

| Header | Default Value | Threat Mitigated |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'` | XSS, script injection |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | SSL stripping, protocol downgrade |
| `X-Content-Type-Options` | `nosniff` | MIME-type sniffing attacks |
| `X-Frame-Options` | `DENY` | Clickjacking via `<iframe>` embedding |
| `X-XSS-Protection` | `0` | Disables legacy browser XSS filter (which could itself be exploited; CSP supersedes it) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Cross-origin information leakage in `Referer` header |
| `Permissions-Policy` | Restricts camera, microphone, geolocation | Unauthorized feature access from embedded content |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-origin window handle leakage |
| `Cross-Origin-Resource-Policy` | `same-origin` | Cross-site data leakage via `<img>`/`<script>` |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Spectre-class memory side-channel attacks |

### Why Enable This?

The MCP HTTP transport is an HTTP server. If the endpoint is exposed to any browser-based client (e.g., a web-based Claude interface, a custom MCP dashboard), browser security policies apply. Without these headers:

- A page loaded from a different origin can embed your MCP endpoint in an `<iframe>` (**clickjacking**).
- A compromised CDN or injected script can call your endpoint cross-origin (**CSRF**).
- Browsers may infer incorrect content types for responses (**MIME sniffing**).
- Shared-process memory attacks (Spectre) are easier without COOP/COEP (**side-channel**).

Even for purely server-to-server MCP (STDIO or private HTTP), enabling this adds defense-in-depth with zero performance cost.

### Custom Configuration

Override individual headers by passing a nosecone options object. Only the keys you specify are overridden; all others keep their defaults.

```bash
# Inline JSON override
cloud-fs-mcp s3 s3://my-bucket --transport http --security-headers \
  --security-headers-config '{
    "contentSecurityPolicy": {
      "directives": {
        "default-src": ["\"self\""],
        "connect-src": ["\"self\"", "https://api.example.com"]
      }
    },
    "strictTransportSecurity": {
      "maxAge": 63072000,
      "includeSubDomains": true,
      "preload": true
    }
  }'
```

```bash
# From a config file (better for complex policies)
cloud-fs-mcp s3 s3://my-bucket --transport http --security-headers \
  --security-headers-config-file /etc/cloud-fs/security-headers.json
```

Example `security-headers.json`:
```json
{
  "contentSecurityPolicy": false,
  "strictTransportSecurity": {
    "maxAge": 63072000,
    "includeSubDomains": true,
    "preload": true
  },
  "xFrameOptions": "SAMEORIGIN"
}
```

Set a header option to `false` to disable it entirely. See [nosecone's full options reference](https://github.com/arcjet/arcjet-js/tree/main/nosecone#options) for all available keys.

::: info Peer Dependency
`nosecone` is an optional peer dependency — it ships in the Bun runtime but must be installed manually for Node.js deployments:
```bash
npm install nosecone
# or
yarn add nosecone
```
:::


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
