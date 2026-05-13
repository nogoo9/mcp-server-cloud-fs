<p align="center">
  <img src="docs/public/images/logo.png" alt="nogoo9" width="128" />
</p>

<h1 align="center">@nogoo9/mcp-server-cloud-fs</h1>

<p align="center">
  <a href="https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml"><img src="https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://nogoo9.github.io/mcp-server-cloud-fs/"><img src="https://img.shields.io/badge/docs-GitHub_Pages-blue?logo=github" alt="Docs"></a>
  <a href="https://coveralls.io/github/nogoo9/mcp-server-cloud-fs?branch=main"><img src="https://coveralls.io/repos/github/nogoo9/mcp-server-cloud-fs/badge.svg?branch=main" alt="Coverage"></a>
  <a href="https://semgrep.dev"><img src="https://img.shields.io/badge/SAST-Semgrep-4B11A8?logo=semgrep&logoColor=white" alt="Semgrep"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs"><img src="https://img.shields.io/npm/v/@nogoo9/mcp-server-cloud-fs" alt="npm"></a>
  <img src="https://img.shields.io/npm/dm/%40nogoo9%2Fmcp-server-cloud-fs" alt="NPM Downloads">
  <a href="https://skills.sh/nogoo9/mcp-server-cloud-fs"><img src="https://skills.sh/b/nogoo9/mcp-server-cloud-fs" alt="skills.sh"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm--Shield--1.0.0-blue" alt="License"></a>
</p>

<p align="center">
  Cloud replacement for <code>mcp-server-filesystem</code> — 20+ tools for S3, Azure Blob, and GCS.<br/>
  Deploy locally via STDIO or remotely over HTTP/WebSocket with OAuth 2.1 auth.<br/>
  Also available as an npm library and interactive TUI.
</p>

<p align="center">
  <strong>📖 <a href="https://nogoo9.github.io/mcp-server-cloud-fs/latest/">Read the full documentation →</a></strong>
</p>

<p align="center">
  <img src="docs/public/images/cloud-fs-demo.gif" alt="cloud-fs interactive shell demo" width="700" />
</p>

**Providers:** Amazon S3 · Azure Blob Storage · Google Cloud Storage · MinIO · RustFS · Cloudflare R2 · Backblaze B2 · Wasabi · LocalStack · SQLite · In-Memory

---

## Table of Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Interactive Shell](#interactive-shell-cloud-fs)
- [Transports](#transports)
- [Authentication & Authorization](#authentication--authorization)
- [Production Features](#production-features)
- [CLI Reference](#cli-reference)
- [Provider Setup](#provider-setup)
- [MCP Client Config](#mcp-client-config)
- [Tool Reference](#tool-reference)
- [Architecture: VFS](#architecture-virtual-filesystem-vfs)
- [Caching](#caching)
- [Programmatic Usage](#programmatic-usage-npm-library)
- [MCP Inspector](#mcp-inspector)
- [Development & Testing](#development--testing)
- [AI Agent Skill](#ai-agent-skill)
- [Documentation](#documentation)
- [License](#license)

---

## What it does

`@nogoo9/mcp-server-cloud-fs` exposes all 14 tools defined by [`mcp-server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — same tool names, same parameter schemas — over cloud object storage. Drop it into any MCP client config that currently points at `mcp-server-filesystem` and your AI assistant gains read/write access to S3, Azure Blob Storage, or Google Cloud Storage buckets.

It also includes **5 extended tools** inspired by [claude-code's filesystem tool surface](https://github.com/codeaashu/claude-code/tree/main/src/tools): line-range reads, in-process regex search (single file and multi-file), server-side copy, and opt-in deletion.

A **Virtual Filesystem (VFS) layer** provides FUSE-like cache coherence, a **shell tool** lets you run POSIX-like commands (`ls`, `grep`, `jq`, `cat | wc`, etc.) against cloud storage, and the package is available as a **programmatic npm library**.

### v0.5.0 Highlights

- **Interactive TUI (`cloud-fs`)**: Terminal shell with `cd`, tab completion, and command history
- **Multi-transport**: STDIO (default), Streamable HTTP, and WebSocket
- **Dual runtime**: Bun-native and Node.js support (HTTP transport + SQLite provider)
- **OAuth 2.1**: Built-in auth server or external IdP token validation
- **ext-auth extensions**: Client Credentials (M2M) and Enterprise-Managed Authorization (SSO)
- **Production hardening**: Rate limiting, CORS, security headers, health checks, structured logging
- **AI agent skill**: Installable `skills/cloud-fs` for Claude Code, Gemini CLI, and other AI assistants

---

## Quick start

### Local (STDIO — default)

```bash
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket
```

### Remote (HTTP)

```bash
# Bun (zero Express dependency)
bunx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket --transport http --port 3000

# Node.js (requires express peer dep)
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket --transport http --port 3000
```

### Remote (WebSocket — Bun only)

```bash
bunx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket --transport ws --port 3000
```

### Demo (no cloud credentials needed)

```bash
bunx @nogoo9/mcp-server-cloud-fs memory mem://demo --enable-shell --seed-demo
```

---

## Interactive Shell (`cloud-fs`)

Drop into an interactive terminal for exploring and managing cloud storage — no MCP client needed:

```bash
# S3
npx -p @nogoo9/mcp-server-cloud-fs cloud-fs s3 s3://my-bucket

# In-memory demo with sample files
npx -p @nogoo9/mcp-server-cloud-fs cloud-fs memory mem://demo --seed-demo

# With a config file (cloud-fs.json in CWD)
npx -p @nogoo9/mcp-server-cloud-fs cloud-fs
```

### Features

- **`cd` navigation** — `cd data`, `cd ..`, `cd /` with dynamic prompt showing current directory
- **Tab completion** — context-aware path and command completion
- **Command history** — persistent across sessions (`~/.cloud-fs_history`)
- **Relative paths** — all commands resolve relative to `cwd`, just like a real shell
- **19 built-in commands** — `ls`, `cat`, `head`, `tail`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `stat`, `find`, `grep`, `wc`, `du`, `echo`, `tee`, `diff`, `jq`, `cd`
- **Pipes & redirects** — `cat config.json | jq '.database'`, `echo hello > file.txt`

### Local development

```bash
bun src/cli-tui.ts memory mem://demo --seed-demo
```

---

## Transports

The server supports three MCP transports, selected via `--transport`:

| Transport | Flag | Runtime | Use case |
|---|---|---|---|
| **STDIO** | `--transport stdio` (default) | Bun, Node | Local `npx`, Claude Desktop, Claude Code |
| **Streamable HTTP** | `--transport http` | Bun ✅, Node ✅ | Remote deployment, multi-user, enterprise |
| **WebSocket** | `--transport ws` | Bun only | Low-latency bidirectional, real-time apps |

### Streamable HTTP

Implements the [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) with a single `/mcp` endpoint for POST (requests), GET (SSE notifications), and DELETE (session termination).

**Dual runtime support:**

- **Bun**: Uses `WebStandardStreamableHTTPServerTransport` with `Bun.serve()` directly — zero Express dependency, maximum performance.
- **Node.js**: Falls back to `StreamableHTTPServerTransport` with Express. Requires `express` as an optional peer dependency (`npm install express`).

Runtime is auto-detected at startup.

**Session management:**

Sessions use **UUID v7** (RFC 9562) — time-ordered and K-sortable, making them ideal for logging, debugging, and database indexing. Sessions are tracked via the `Mcp-Session-Id` header.

**Resumability:**

When an EventStore is configured, clients can reconnect and resume receiving messages from where they left off via the `Last-Event-ID` SSE header.

```bash
# Basic HTTP server
cloud-fs-mcp s3 s3://my-bucket --transport http --port 3000

# With authentication
cloud-fs-mcp s3 s3://my-bucket --transport http --port 3000 --auth builtin --auth-issuer https://my-server.example.com

# Production deployment
cloud-fs-mcp s3 s3://my-bucket \
  --transport http --port 3000 --host 0.0.0.0 \
  --auth external --auth-jwks-uri https://login.example.com/.well-known/jwks.json \
  --cors-origin https://app.example.com \
  --rate-limit 60 --rate-limit-burst 10 \
  --security-headers \
  --request-logging
```

### WebSocket

Bun-native WebSocket transport using `Bun.serve()` with WebSocket upgrade handling. Provides lower latency than HTTP for high-frequency tool invocations.

- JSON-RPC message framing over WebSocket
- UUID v7 session assigned on upgrade
- WS ping/pong heartbeat for connection liveness

```bash
cloud-fs-mcp s3 s3://my-bucket --transport ws --port 3000
```

---

## Authentication & Authorization

Authentication is **disabled by default** and only applies to HTTP/WS transports. STDIO mode never requires auth.

### Auth modes

| Mode | Flag | Description |
|---|---|---|
| `none` | `--auth none` (default) | No authentication. Suitable for local/trusted networks. |
| `builtin` | `--auth builtin` | Self-hosted OAuth 2.1 Authorization Server. The MCP server acts as both AS and RS. |
| `external` | `--auth external` | Validate bearer tokens against an external IdP (Okta, Auth0, Keycloak, Azure AD). |

### Built-in OAuth server (`--auth builtin`)

The server runs a full OAuth 2.1 Authorization Server using the MCP SDK's `mcpAuthRouter()`:

- **Authorization Code + PKCE** (mandatory) — interactive user consent flow
- **Dynamic Client Registration** — MCP clients auto-register on first connect
- **Refresh token rotation** — single-use refresh tokens prevent replay
- **Metadata discovery** — `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/oauth-protected-resource` (RFC 9728)

```bash
cloud-fs-mcp s3 s3://my-bucket \
  --transport http --port 3000 \
  --auth builtin --auth-issuer https://my-server.example.com
```

### External IdP (`--auth external`)

The server only validates bearer tokens — it does not issue tokens. Use this when you have an existing identity provider.

- **JWKS validation** — fetches and caches signing keys from your IdP
- **JWT verification** — checks signature, issuer, audience, expiry
- **Token introspection** — fallback for opaque tokens

```bash
cloud-fs-mcp s3 s3://my-bucket \
  --transport http --port 3000 \
  --auth external \
  --auth-jwks-uri https://login.example.com/.well-known/jwks.json \
  --auth-audience https://cloud-fs.example.com
```

### ext-auth: Client Credentials (M2M)

Implements the [MCP Client Credentials extension](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/draft/oauth-client-credentials.mdx) for machine-to-machine authentication without user interaction. Designed for CI/CD pipelines, background services, and automated workflows.

- **JWT assertion auth** (`private_key_jwt` per RFC 7523) — recommended
- **Client secret auth** (`client_secret_basic`) — simpler but less secure
- No user interaction required — tokens granted based on pre-registered client credentials

```bash
cloud-fs-mcp s3 s3://my-bucket \
  --transport http --port 3000 \
  --auth builtin --auth-issuer https://my-server.example.com \
  --auth-client-credentials
```

### ext-auth: Enterprise-Managed Authorization (SSO)

Implements the [MCP Enterprise-Managed Authorization extension](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/draft/enterprise-managed-authorization.mdx) for seamless SSO via your organization's Identity Provider.

**How it works:**

1. User logs in to the MCP Client via the enterprise IdP (OpenID Connect or SAML)
2. Client exchanges the ID Token for an Identity Assertion JWT Authorization Grant (ID-JAG) via Token Exchange (RFC 8693)
3. Client presents the ID-JAG to this server's Authorization Server (RFC 7523)
4. Server validates the ID-JAG and issues an access token

**Benefits:**

- Zero manual authorization per MCP Server — SSO handles everything
- Enterprise admins control which users/groups can access which MCP servers
- Granular scope enforcement via IdP policies

```bash
cloud-fs-mcp s3 s3://my-bucket \
  --transport http --port 3000 \
  --auth builtin --auth-issuer https://my-server.example.com \
  --auth-enterprise-idp https://acme.okta.com
```

### OAuth Scopes

When auth is enabled, tool access is controlled by granular scopes:

| Scope | Tools |
|---|---|
| `cloud-fs:read` | `read_file`, `read_text_file`, `read_media_file`, `read_multiple_files`, `read_file_range` |
| `cloud-fs:write` | `write_file`, `edit_file`, `create_directory` |
| `cloud-fs:delete` | `delete_file` |
| `cloud-fs:search` | `search_files`, `grep_file`, `grep_files`, `list_directory`, `list_directory_with_sizes`, `directory_tree` |
| `cloud-fs:shell` | `shell` |
| `cloud-fs:admin` | All tools + `get_file_info`, `list_allowed_directories` |

Tokens with insufficient scopes receive a clear error response indicating which scope is required.

---

## Production Features

### Health Checks

HTTP/WS transports expose Kubernetes-convention health endpoints:

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `/healthz` | Liveness — is the process alive? | `200 OK` always | Process is dead |
| `/readyz` | Readiness — can it serve traffic? | `200 OK` after VFS hydration | `503` during startup |

Configure your orchestrator's liveness and readiness probes to use these endpoints.

### Rate Limiting

Token bucket rate limiting protects against abuse. **Disabled by default.**

- **In-memory** — per-IP/per-client counters for single-process deployments
- **Redis** — distributed rate limiting for multi-instance deployments (uses existing optional `ioredis` peer dep)
- Returns `429 Too Many Requests` with `Retry-After` header when limits are exceeded

```bash
# 60 requests/minute with burst of 10
cloud-fs-mcp s3 s3://my-bucket --transport http \
  --rate-limit 60 --rate-limit-burst 10
```

### CORS

Cross-Origin Resource Sharing for browser-based MCP clients:

- Strict origin allowlist — no wildcards in production
- Exposes `Mcp-Session-Id` and `Mcp-Protocol-Version` headers
- Localhost auto-allows `*` when `--host 127.0.0.1` (dev convenience)

```bash
cloud-fs-mcp s3 s3://my-bucket --transport http \
  --cors-origin https://app.example.com \
  --cors-origin https://staging.example.com
```

### Structured Request Logging

JSON audit trail to stderr for compliance and debugging:

```json
{"ts":"2026-05-12T12:00:00Z","sessionId":"019...","tool":"read_file","user":"alice@example.com","latencyMs":42,"status":200}
```

Enable with `--request-logging`.

### DNS Rebinding Protection

Automatically applied when binding to localhost addresses. Validates the `Host` header against allowed hostnames to prevent DNS rebinding attacks.

### Security Headers

Opt-in HTTP response hardening via [nosecone](https://github.com/arcjet/arcjet-js/tree/main/nosecone) — a framework-agnostic security headers library. Works with both Bun-native and Node/Express transports.

When enabled, every HTTP response includes standard security headers:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Referrer-Policy`
- And more (see [nosecone defaults](https://docs.arcjet.com/nosecone/quick-start))

```bash
# Enable with defaults
cloud-fs-mcp s3 s3://my-bucket --transport http --security-headers

# Custom configuration via inline JSON
cloud-fs-mcp s3 s3://my-bucket --transport http \
  --security-headers-config '{"contentSecurityPolicy":false}'

# Custom configuration via file
cloud-fs-mcp s3 s3://my-bucket --transport http \
  --security-headers-config-file ./nosecone.json
```

> **Note:** Requires the `nosecone` peer dependency: `npm install nosecone`

---

## CLI Reference

```
cloud-fs-mcp <provider> <root-uri> [root-uri...] [options]
```

### Providers

| Provider | URI format | Description |
|---|---|---|
| `s3` | `s3://bucket[/prefix]` | AWS S3, and any S3-compatible endpoint (MinIO, RustFS, Cloudflare R2, Backblaze B2, Wasabi, LocalStack, …) |
| `azure` | `az://container[/prefix]` | Azure Blob Storage |
| `gcs` | `gs://bucket[/prefix]` | Google Cloud Storage |
| `memory` | `mem://name` | In-memory (ephemeral, for demos) |
| `sqlite` | `sqlite://name` | SQLite (persistent local) |

### Options

#### Transport & Network

| Flag | Default | Description |
|---|---|---|
| `--transport <stdio\|http\|ws>` | `stdio` | Transport protocol |
| `--port <number>` | `3000` | Listen port (http/ws only) |
| `--host <address>` | `127.0.0.1` | Bind address (http/ws only) |

#### Authentication

| Flag | Default | Description |
|---|---|---|
| `--auth <none\|builtin\|external>` | `none` | Auth mode (http/ws only) |
| `--auth-issuer <url>` | — | OAuth issuer URL (builtin mode) |
| `--auth-jwks-uri <url>` | — | JWKS URI (external mode) |
| `--auth-audience <string>` | — | Expected token audience (external mode) |
| `--auth-client-credentials` | `false` | Enable Client Credentials ext-auth flow |
| `--auth-enterprise-idp <url>` | — | Enable Enterprise-Managed Authorization |

#### Production

| Flag | Default | Description |
|---|---|---|
| `--cors-origin <origin>` | — | Allowed CORS origin (repeatable) |
| `--rate-limit <req/min>` | `0` (off) | Rate limit per client |
| `--rate-limit-burst <n>` | `10` | Burst allowance |
| `--request-logging` | `false` | Enable structured JSON request logging |
| `--security-headers` | `false` | Enable security headers via nosecone |
| `--security-headers-config <json>` | — | Inline JSON config for nosecone |
| `--security-headers-config-file <path>` | — | Load nosecone config from a JSON file |

#### Storage & Cache

| Flag | Default | Description |
|---|---|---|
| `--region <region>` | — | Cloud region (S3, GCS) |
| `--endpoint <url>` | — | Custom endpoint for S3-compatible backends |
| `--cache-store <memory\|fs\|redis>` | `memory` | Cache backend |
| `--cache-ttl <seconds>` | `60` | Cache TTL in seconds |
| `--sync-debounce <ms>` | `2000` | Write flush delay in ms |
| `--cache-dir <path>` | — | Directory for fs cache store |
| `--no-cache` | — | Bypass cache entirely (pass-through mode) |
| `--gcs-endpoint <url>` | — | Custom endpoint for GCS |
| `--sqlite-db <path>` | — | SQLite database file path |
| `--ca-file <path>` | — | PEM CA bundle for TLS (S3-compatible + Redis) |

#### Tools

| Flag | Default | Description |
|---|---|---|
| `--enable-delete` | `false` | Enable the `delete_file` tool |
| `--enable-shell` | `false` | Enable the `shell` tool |
| `--grep-max-objects <n>` | `1000` | Max objects `grep_files` scans per call |
| `--seed-demo` | `false` | Seed VFS with sample files for demo |

Credentials are always sourced from SDK credential chains — never CLI flags.

---

## Provider Setup

### AWS S3

Credentials are read from the standard AWS credential chain: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars, `~/.aws/credentials`, EC2 instance profiles, and so on.

```bash
cloud-fs-mcp s3 s3://my-bucket --region us-east-1
```

### S3-compatible storage

Any S3-compatible backend works via `--endpoint`. All use the standard AWS credential chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).

| Provider | `--endpoint` value | Notes |
|---|---|---|
| **MinIO** | `http://minio:9000` | Self-hosted; use `--ca-file` for TLS with a private CA |
| **RustFS** | `http://rustfs:9000` | Rust-native S3-compatible store |
| **LocalStack** | `http://localhost:4566` | Full AWS emulator for local dev and CI |
| **Cloudflare R2** | `https://<account-id>.r2.cloudflarestorage.com` | No egress fees; use an R2 API token as the secret key |
| **Backblaze B2** | `https://s3.<region>.backblazeb2.com` | Use B2 application key ID / key |
| **Wasabi** | `https://s3.<region>.wasabisys.com` | Compatible, no egress fees |
| **DigitalOcean Spaces** | `https://<region>.digitaloceanspaces.com` | Use a Spaces access key |
| **Scaleway** | `https://s3.<region>.scw.cloud` | Use a Scaleway access key |
| **Ceph RGW** | `http://<rgw-host>:<port>` | Enterprise self-hosted; supports all S3 APIs |
| **SeaweedFS** | `http://<master>:8333` | High-throughput distributed FS with S3 API |
| **Garage** | `http://<node>:3900` | Lightweight distributed S3 for homelabs |

```bash
# MinIO
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
cloud-fs-mcp s3 s3://my-bucket --endpoint http://minio:9000

# Cloudflare R2
export AWS_ACCESS_KEY_ID=<r2-access-key-id>
export AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>
cloud-fs-mcp s3 s3://my-bucket --endpoint https://<account-id>.r2.cloudflarestorage.com --region auto

# Backblaze B2
export AWS_ACCESS_KEY_ID=<b2-key-id>
export AWS_SECRET_ACCESS_KEY=<b2-application-key>
cloud-fs-mcp s3 s3://my-bucket --endpoint https://s3.us-west-004.backblazeb2.com --region us-west-004

# LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
cloud-fs-mcp s3 s3://my-bucket --endpoint http://localhost:4566 --region us-east-1
```

> **TLS with private CA:** For MinIO, RustFS, or Ceph with a self-signed certificate, add `--ca-file /path/to/ca.pem`.

### Azure Blob Storage

Uses `DefaultAzureCredential` — works with `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` env vars, managed identity, `az login`, and so on.

```bash
cloud-fs-mcp azure az://my-container
```

### Google Cloud Storage

Uses Application Default Credentials (ADC). Set `GOOGLE_APPLICATION_CREDENTIALS` or run `gcloud auth application-default login`.

```bash
cloud-fs-mcp gcs gs://my-bucket
```

### In-Memory (ephemeral)

Zero-config, zero-dependency provider. All data lives in a `Map` and is lost when the process exits.

```bash
cloud-fs-mcp memory mem://demo --enable-shell
```

### SQLite (persistent local)

Persistent local storage using WAL mode. Dual-runtime: uses `bun:sqlite` on Bun, `better-sqlite3` on Node.js (install as peer dep: `npm install better-sqlite3`).

```bash
cloud-fs-mcp sqlite sqlite://my-bucket --sqlite-db /tmp/cloud-fs.db --enable-shell
```

---

## MCP Client Config

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "cloud-fs": {
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3", "s3://my-bucket"]
    }
  }
}
```

### Claude Code

`.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3", "s3://my-bucket"]
    }
  }
}
```

### Remote HTTP client

```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "streamable-http",
      "url": "https://cloud-fs.example.com/mcp"
    }
  }
}
```

---

## Tool Reference

All paths are cloud URIs — e.g. `s3://my-bucket/path/to/file.txt`. The server validates every path against the configured root URIs at startup; requests outside allowed roots are rejected.

### Read tools

| Tool | Parameters | Description |
|---|---|---|
| `read_file` | `path` | Read a file. Binary → base64; text → UTF-8. |
| `read_text_file` | `path`, `head?`, `tail?` | Read text file with optional head/tail line limits. |
| `read_media_file` | `path` | Read image/media as base64 MCP image content block. |
| `read_multiple_files` | `paths` | Read several files in parallel. |
| `read_file_range` ✨ | `path`, `offset`, `limit` | Read a 1-based line range with total line count header. |

### Write tools

| Tool | Parameters | Description |
|---|---|---|
| `write_file` | `path`, `content` | Write/overwrite a file. Flushed after debounce window. |
| `edit_file` | `path`, `edits[]`, `dryRun?` | Apply `{ oldText, newText }` edits. Preview with `dryRun`. |

### Directory tools

| Tool | Parameters | Description |
|---|---|---|
| `create_directory` | `path` | Create a directory placeholder and parent prefixes. |
| `list_directory` | `path` | List immediate children (like `ls`). |
| `list_directory_with_sizes` | `path`, `sortBy?`, `limit?` | List children with sizes. Sort by size or name. |
| `directory_tree` | `path`, `excludePatterns?` | Recursive directory tree with glob exclusions. |

### Move, Copy & Delete tools

| Tool | Parameters | Description |
|---|---|---|
| `move_file` | `source`, `destination` | Move file. Server-side copy + delete for same-bucket. |
| `copy_file` ✨ | `source`, `destination` | Copy file. Server-side for same-bucket. |
| `delete_file` ✨ | `path` | Delete file. **Requires `--enable-delete`.** |

### Search tools

| Tool | Parameters | Description |
|---|---|---|
| `search_files` | `path`, `pattern`, `excludePatterns?` | Glob-based object key search. |
| `grep_file` ✨ | `path`, `pattern`, `case_insensitive?` | Regex search in a single file with line numbers. |
| `grep_files` ✨ | `path`, `pattern`, `glob?`, `case_insensitive?`, `output_mode?`, `max_objects?` | Regex search across all objects under a path. |

### Info tools

| Tool | Parameters | Description |
|---|---|---|
| `get_file_info` | `path` | File metadata: size, last-modified, content type. |
| `list_allowed_directories` | _(none)_ | List configured root URIs. |

> ✨ = Extended tool

### Shell tool ⚡

| Tool | Parameters | Description |
|---|---|---|
| `shell` ⚡ | `command` | Execute POSIX-like commands. Supports pipes, redirects. **Requires `--enable-shell`.** |

**Built-in commands:** `ls`, `cat`, `head`, `tail`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `stat`, `find`, `grep`, `wc`, `du`, `echo`, `tee`, `diff`, `jq`, `cd`

#### Relative paths

All shell commands (and all other tools) support **relative paths** — you don't need to type the full URI every time. Paths without a scheme prefix (`s3://`, `mem://`, etc.) are resolved relative to the first configured root:

```bash
# With root s3://my-bucket/data, these are equivalent:
shell "cat config.json"
shell "cat s3://my-bucket/data/config.json"

# Subdirectories work naturally:
shell "ls logs/"
shell "cat logs/app.log | grep ERROR"

# ls with no args lists the root's contents:
shell "ls"

# find with no args searches from the root:
shell "find -name '*.json'"
```

Standard `.` and `..` are normalized, with `..` traversal blocked at the root boundary for security.

#### Examples

```bash
# List root contents
shell "ls -l"

# JSON query with jq
shell "cat config.json | jq '.database.port'"

# Search and count
shell "grep -i error server.log | wc -l"

# Write files
shell "echo hello world > greeting.txt"

# Copy and diff
shell "cp config.json config.backup.json"
shell "diff config.json config.backup.json"

# Full URIs still work for cross-root access
shell "cat s3://other-bucket/file.txt"
```

> ⚡ Requires `--enable-shell`. `rm` and `mv` additionally require `--enable-delete`.

---

## Architecture: Virtual Filesystem (VFS)

All tool operations are mediated through a **Virtual Filesystem (VFS)** layer inspired by [FUSE](https://en.wikipedia.org/wiki/Filesystem_in_Userspace).

```
┌─────────────────────────────────────────────────────────┐
│  MCP Tool Handlers (read, write, list, stat, …)         │
├─────────────────────────────────────────────────────────┤
│  VirtualFS                                              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐              │
│  │  Inodes   │ │ DirIndex  │ │ Tombstones│              │
│  │ (metadata)│ │ (parents) │ │ (deleted) │              │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘              │
│        └──────────────┴─────────────┘                   │
│         ⇣ Overlay (in-memory, persisted to CacheStore)  │
├─────────────────────────────────────────────────────────┤
│  CacheStore (Memory / Filesystem / Redis)               │
├─────────────────────────────────────────────────────────┤
│  StorageProvider (S3 / Azure Blob / GCS / Memory / SQL) │
└─────────────────────────────────────────────────────────┘
```

| Operation | Resolution |
|---|---|
| **`get()`** | Cache hit → return. Tombstoned → throw. Else → provider fallback. |
| **`stat()`** | Inode overlay → cached content size → provider `headObject`. |
| **`list()`** | Provider listing – tombstones + overlay dirIndex entries. |
| **`put()`** | Cache set + markDirty + inode update + dirIndex. Immediate visibility. |
| **`remove()`** | Provider deleteObject + cache evict + tombstone. Immediate invisibility. |

VFS metadata is persisted to the CacheStore under `__vfs__/*` keys. On startup, `VirtualFS.hydrate()` restores state; corrupted data is silently discarded.

---

## Caching

| Backend | Flag | Notes |
|---|---|---|
| **Memory** (default) | `--cache-store memory` | In-process, fast, not shared, not persistent. |
| **Filesystem** | `--cache-store fs --cache-dir <path>` | Survives restarts. |
| **Redis** | `--cache-store redis` | Shared, persistent. Requires `ioredis` peer dep. `REDIS_URL` env var. Use `rediss://` for TLS. |

**Writes** land in cache immediately (marked dirty), flushed after debounce window (default: 2s). **Graceful shutdown** flushes all dirty entries before exit. **Pass-through mode** (`--no-cache`) sends every operation directly to the provider.

> **⚠️ Redis TLS:** The server warns at startup when `REDIS_URL` uses unencrypted `redis://`. Use `rediss://` for TLS-encrypted connections in production.

### Custom CA Certificates

Use `--ca-file <path>` to supply a PEM CA bundle for S3-compatible endpoints (MinIO, RustFS) and Redis running with a private CA:

```bash
# S3-compatible with self-signed CA
cloud-fs-mcp s3 s3://my-bucket \
  --endpoint https://minio.internal:9000 \
  --ca-file /etc/ssl/certs/my-ca.pem

# Redis with private CA
REDIS_URL=rediss://redis.internal:6380 \
cloud-fs-mcp s3 s3://my-bucket --cache-store redis \
  --ca-file /etc/ssl/certs/my-ca.pem
```

For runtime-wide CA trust (all providers + Redis), use the standard `NODE_EXTRA_CA_CERTS` env var instead:

```bash
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/my-ca.pem cloud-fs-mcp s3 s3://my-bucket
```

---

## Programmatic Usage (npm library)

```ts
import {
  createMcpServer, VirtualFS, MemoryStore,
  S3Provider, parseUri,
} from "@nogoo9/mcp-server-cloud-fs";

const roots    = [parseUri("s3://my-bucket")];
const provider = new S3Provider({ region: "us-east-1" });
const cache    = new MemoryStore(provider, { ttlMs: 60_000, syncDebounceMs: 2000 });
const vfs      = new VirtualFS(provider, cache);
await vfs.hydrate();

const server = createMcpServer({ vfs, roots });
```

### Exported API

| Export | Description |
|---|---|
| `createMcpServer(ctx)` | Create a configured MCP server instance |
| `executeShell(command, ctx)` | Run POSIX-like commands against the VFS |
| `VirtualFS` | FUSE-inspired write-back overlay |
| `MemoryStore`, `FilesystemStore`, `createRedisStore`, `PassThroughCache` | Cache backends |
| `S3Provider`, `AzureProvider`, `GcsProvider`, `MemoryProvider`, `SqliteProvider` | Storage providers |
| `parseUri`, `toCacheKey`, `resolveToolPath` | Path utilities |
| `ShellContext`, `ShellCommandHandler` | Shell extension types |

---

## MCP Inspector

```bash
# Quick demo (no credentials needed)
bun run inspect:memory

# Custom configuration
bun run inspect -- s3 s3://my-bucket --region us-east-1 --enable-shell
```

---

## MCP App: Interactive Shell (xterm.js)

Build the app: `bun run build:app` → outputs `dist/app/shell-app.html`.

Catppuccin Mocha theme, command history, auto-resize. Renders inside compatible MCP hosts (Claude Desktop) via the MCP Apps extension.

---

## Development & Testing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions.

**AI agent skills** are installed separately after cloning via `bun x skills add semgrep/skills` — see [CONTRIBUTING.md](CONTRIBUTING.md#ai-agent-skills) for details.

### Test tiers

| Tier | Command | Infra? |
|---|---|---|
| **Unit** | `bun run test` | No |
| **E2E (HTTP)** | `bun run test:e2e:http` | No |
| **E2E (Infra)** | `bun run test:e2e:infra` | Docker |
| **Integration** | `bun run test:integration` | Docker |
| **All** | `bun run test:all` | Docker |

### CI pipeline

The CI workflow runs on every push/PR:

1. **ci** job: lint → typecheck → unit tests (with coverage) → HTTP E2E → build
2. **e2e** job: full E2E with Docker Compose (MinIO, Redis)

HTTP E2E tests use the in-memory provider and need zero infrastructure, making them fast and reliable for every CI run.

---

## AI Agent Skill

The `skills/cloud-fs` directory contains an installable AI agent skill that teaches coding assistants (Claude Code, Gemini CLI, etc.) how to use cloud-fs as a POSIX-like virtual filesystem. Install it to give your assistant fluency with cloud storage commands.

### What it provides

- **MCP mode auto-detection** — recognizes `mcp__cloud-fs__*` tools and maps user intents to the right tool calls
- **Bootstrap flow** — walks the user through first-time setup when the MCP server isn't configured yet
- **POSIX-to-MCP mapping** — translates shell commands (`ls`, `cat`, `grep`, `find`, `cp`, etc.) into the correct MCP tool calls
- **Provider credential reference** — AWS, Azure, GCS, MinIO/RustFS, SQLite setup guidance
- **`.mcp.json` persistence** — offers to save provider configuration so future sessions are pre-wired

### Installation

```bash
# Claude Code
claude mcp add-skill ./skills/cloud-fs

# Gemini CLI
bun x skills add ./skills/cloud-fs
```

See [CONTRIBUTING.md](CONTRIBUTING.md#ai-agent-skills) for details on the skill system.

---

## Documentation

Full documentation is available at **[nogoo9.github.io/mcp-server-cloud-fs](https://nogoo9.github.io/mcp-server-cloud-fs/)**.

- 📖 Versioned docs for each release (v0.4.0+)
- 🔄 PR preview docs for open pull requests
- 🔍 Full-text search, dark mode, responsive design
- Built with [VitePress](https://vitepress.dev/)

To run the documentation site locally:

```bash
bun run docs:dev      # start dev server at http://localhost:5173
bun run docs:build    # build static site
bun run docs:preview  # preview production build
```

---

## License

[PolyForm Shield 1.0.0](LICENSE). Free for any non-competitive use.

---

Built with [![Claude](https://img.shields.io/badge/Claude-d97706?logo=anthropic&logoColor=white)](https://claude.ai) [![Gemini](https://img.shields.io/badge/Gemini-8E75FF?logo=googlegemini&logoColor=white)](https://gemini.google.com) [![Antigravity](https://img.shields.io/badge/Antigravity-4285F4?logo=google&logoColor=white)](https://antigravity.google/)
