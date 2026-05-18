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

## Audit Logging

Tool invocation audit logging provides a structured JSON record of every MCP tool call — who called it, what arguments were passed, whether it succeeded, and how long it took. Designed for compliance, debugging, and observability.

```json
{
  "ts": "2026-05-15T08:30:00.000Z",
  "tool": "read_file",
  "args": { "path": "s3://my-bucket/config.json" },
  "durationMs": 45,
  "success": true
}
```

### Sinks

Audit entries can be sent to one or both sinks:

| Sink | Flag | Description |
|---|---|---|
| **stderr** | `--audit-log` | Writes JSON lines to stderr (useful for container log collectors) |
| **File** | `--audit-log-file <path>` | Appends JSON lines to a file (implies `--audit-log`) |

```bash
# stderr only (for container log aggregation)
cloud-fs-mcp s3 s3://my-bucket --audit-log

# File (for compliance archival)
cloud-fs-mcp s3 s3://my-bucket --audit-log-file /var/log/cloud-fs/audit.jsonl

# Both
cloud-fs-mcp s3 s3://my-bucket --audit-log --audit-log-file /var/log/cloud-fs/audit.jsonl
```

::: tip Programmatic Usage
The SDK exports `AuditLogger`, `StderrAuditSink`, and `FileAuditSink` for custom integrations. You can implement your own sink (e.g., send to a logging service) by implementing the `AuditSink` interface.
:::

## Startup Health Check

Before accepting connections, the server validates that all configured storage roots are reachable. If any root fails — expired credentials, wrong region, missing bucket — the server exits immediately with a diagnostic report instead of starting in a broken state.

```
✗ Health check failed:
  s3://my-bucket — PERMISSION_DENIED: Access Denied (check IAM policy)
  az://reports — AUTHENTICATION_FAILED: DefaultAzureCredential failed (run 'az login')
```

This prevents the common problem of an MCP server starting successfully but failing on the first tool call minutes later — especially frustrating during an AI conversation.

::: info Programmatic API
Use `checkHealth()` and `formatHealthReport()` from the SDK to validate credentials in your own applications before creating a VFS instance.

```typescript
import { checkHealth, formatHealthReport } from "@nogoo9/mcp-server-cloud-fs";

const report = await checkHealth(provider, roots);
if (!report.healthy) {
  console.error(formatHealthReport(report));
  process.exit(1);
}
```
:::

## DLP Content Sanitization

The Data Loss Prevention (DLP) middleware redacts sensitive content from tool responses before they reach the MCP client. This prevents accidental leakage of secrets, PII, and credentials into LLM context windows.

### Default Patterns

| Pattern | Label | Example Match |
|---------|-------|---------------|
| AWS Access Key | `AWS_KEY` | `AKIAIOSFODNN7EXAMPLE` |
| AWS Secret Key | `AWS_SECRET` | `wJalrXUtnFEMI/K7MDENG/...` |
| Email Address | `EMAIL` | `alice@example.com` |
| US SSN | `SSN` | `123-45-6789` |
| Credit Card | `CC` | `4111 1111 1111 1111` |
| JWT Token | `JWT` | `eyJhbGciOiJI...` |
| Generic Secret | `GENERIC_SECRET` | `password="s3cr3t"` |
| API Key | `API_KEY` | `sk-abc123...`, `sk_live_...` |
| Private Key | `PRIVATE_KEY` | `-----BEGIN RSA PRIVATE KEY-----` |

### Usage

```bash
# Enable DLP with default patterns
cloud-fs-mcp s3 s3://my-bucket --enable-dlp
```

All tool responses are scanned and redacted inline. The redaction count is logged for audit purposes.

::: tip Programmatic Usage
Import `sanitizeContent` and `DEFAULT_DLP_PATTERNS` from the SDK to use DLP in custom integrations:

```typescript
import { sanitizeContent, DEFAULT_DLP_PATTERNS } from "@nogoo9/mcp-server-cloud-fs/middleware/dlp";

const { sanitized, redactionCount } = sanitizeContent(text, DEFAULT_DLP_PATTERNS);
```
:::

## DNS Rebinding Protection

Automatically applied when binding to localhost addresses. Validates the `Host` header against allowed hostnames to prevent DNS rebinding attacks.

## Graceful Shutdown

On `SIGINT` / `SIGTERM`, the server:

1. Stops accepting new connections
2. Waits for in-flight requests to complete
3. Flushes all dirty VFS entries to the storage provider
4. Exits cleanly

This prevents data loss from unflushed writes.
