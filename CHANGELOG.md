# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] — 2026-05-12

### Added

- **Documentation site** — VitePress-powered docs deployed to GitHub Pages with versioned releases, PR previews, full-text search, and dark mode ([nogoo9.github.io/mcp-server-cloud-fs](https://nogoo9.github.io/mcp-server-cloud-fs/))
- **Streamable HTTP transport** — deploy `cloud-fs-mcp` as a remote HTTP service with full [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) support:
  - **Dual runtime**: Bun-native via `WebStandardStreamableHTTPServerTransport` + `Bun.serve()` (zero Express dependency), Node.js via `StreamableHTTPServerTransport` + Express
  - Runtime auto-detection at startup — falls back gracefully based on available APIs
  - Stateful session management with **UUID v7** (time-sortable, RFC 9562) session IDs
  - SSE streaming for server-to-client notifications and tool progress
  - EventStore support for resumability — clients can reconnect and resume where they left off
  - `--transport http` CLI flag (default: `stdio` for backward compatibility)
  - `--port <number>` (default: 3000) and `--host <address>` (default: 127.0.0.1) flags
- **WebSocket transport** — low-latency bidirectional transport using Bun-native `Bun.serve()` WebSocket:
  - JSON-RPC message framing over WS
  - Session tracking with UUID v7 assigned on WebSocket upgrade
  - WS ping/pong heartbeat for connection health
  - `--transport ws` CLI flag
- **OAuth 2.1 authentication** — three auth modes selectable via `--auth`:
  - `none` (default) — no auth, same as v0.3.0
  - `builtin` — self-hosted OAuth 2.1 Authorization Server using the MCP SDK's `mcpAuthRouter()`:
    - Authorization Code grant with **mandatory PKCE**
    - Refresh token rotation (single-use)
    - Dynamic Client Registration
    - `/.well-known/oauth-authorization-server` metadata discovery (RFC 8414)
    - `/.well-known/oauth-protected-resource` metadata (RFC 9728)
  - `external` — validate bearer tokens against an external IdP (Okta, Auth0, Keycloak) via JWKS:
    - Remote JWKS key fetching and caching via `jose` library
    - JWT signature, issuer, audience, and expiry validation
    - Token introspection fallback for opaque tokens
- **ext-auth: OAuth Client Credentials** ([MCP ext-auth](https://github.com/modelcontextprotocol/ext-auth)) — machine-to-machine authentication for CI/CD pipelines, background services, and automated workflows:
  - `client_credentials` grant type support
  - JWT assertion authentication (`private_key_jwt` per RFC 7523)
  - Client secret authentication (`client_secret_basic`)
  - Server metadata advertises `token_endpoint_auth_methods_supported`
  - `--auth-client-credentials` CLI flag to enable
- **ext-auth: Enterprise-Managed Authorization** ([MCP ext-auth](https://github.com/modelcontextprotocol/ext-auth)) — SSO via corporate Identity Provider for zero-friction enterprise onboarding:
  - Identity Assertion JWT Authorization Grant (ID-JAG) validation
  - Token exchange integration (RFC 8693) with enterprise IdP
  - JWT Authorization Grant processing (RFC 7523 §2.1)
  - Supports both OpenID Connect ID Tokens and SAML assertions as subject tokens
  - `--auth-enterprise-idp <url>` CLI flag to enable
- **Granular OAuth scopes** — tool-level access control:
  - `cloud-fs:read` — read tools (read_file, read_text_file, read_media_file, etc.)
  - `cloud-fs:write` — write tools (write_file, edit_file)
  - `cloud-fs:delete` — delete_file tool
  - `cloud-fs:search` — search and grep tools
  - `cloud-fs:shell` — shell tool
  - `cloud-fs:admin` — all tools
- **Rate limiting** — token bucket algorithm with configurable sustained rate and burst capacity:
  - In-memory backend for single-process deployments
  - Redis backend for distributed deployments (uses existing optional `ioredis` peer dep)
  - Per-client / per-IP counters with automatic cleanup
  - Returns `429 Too Many Requests` with `Retry-After` header
  - Disabled by default — opt-in via `--rate-limit <req/min>` and `--rate-limit-burst <n>`
- **CORS** — strict cross-origin request handling:
  - Allowlist-based origin enforcement via `--cors-origin <origin>` (repeatable)
  - Exposes `Mcp-Session-Id` and `Mcp-Protocol-Version` headers
  - No wildcards in production; localhost auto-allows `*` for dev convenience
- **Health check endpoints** — Kubernetes-convention liveness and readiness probes:
  - `/healthz` — liveness probe (always `200 OK` if the process is alive)
  - `/readyz` — readiness probe (checks VFS hydration and provider connectivity)
- **Structured request logging** — JSON audit trail to stderr:
  - Fields: timestamp, sessionId, toolName, userId (from auth), latencyMs, statusCode
  - `--request-logging` flag to enable
- **DNS rebinding protection** — automatically applied when binding to localhost addresses

### Changed

- `express` is now an optional peer dependency (loaded only when `--transport http` on Node.js)
- Session IDs use UUID v7 (time-sortable) instead of UUID v4

### Dependencies

- Added `jose` — JWT/JWKS verification (zero native deps, works Bun + Node)
- Added `uuidv7` — RFC 9562 UUID v7 generation
- Added optional peer: `express` (for Node.js HTTP transport)

## [0.3.0] — 2026-05-12

### Added

- **`shell` tool** — execute POSIX-like shell commands against cloud object storage, giving AI agents a familiar CLI interface on top of the VFS:
  - 17 built-in commands: `ls`, `cat`, `head`, `tail`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `stat`, `find`, `grep`, `wc`, `du`, `echo`, `tee`, `diff`
  - **Pipe support** (`|`) — chain commands together, e.g. `cat s3://b/f | grep pattern | wc -l`
  - **Input redirection** (`<`) — read a file as stdin for the first command
  - **Output redirection** (`>`, `>>`) — write/append stdout to a cloud file
  - All commands run in-process against the VFS — no real shell process is spawned
  - `ls -l` uses POSIX-mimic formatting with `----------` for permissions (cloud has no permission model)
  - Destructive commands (`rm`, `mv`) are gated by `--enable-delete`
- `--enable-shell` CLI flag — opt-in to register the `shell` tool (disabled by default for safety)
- **Programmatic API**: `executeShell(command, ctx)` exported from the npm library for use without MCP
- `ShellContext` and `ShellCommandHandler` types exported for custom command extensions
- **In-Memory provider** (`MemoryProvider`) — fully in-process storage for demos and tests; zero dependencies, URI format `mem://bucket-name`
- **SQLite provider** (`SqliteProvider`) — persistent local storage using `bun:sqlite`; zero external deps, WAL mode, URI format `sqlite://bucket-name`, requires `--sqlite-db <path>` CLI flag
- **MCP App: Interactive Shell** — xterm.js-based terminal UI that renders inside MCP hosts (Claude Desktop etc.) via the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview); Catppuccin Mocha theme, command history, auto-resize
- `--sqlite-db <path>` CLI flag for specifying the SQLite database file location
- `bun run inspect` and `bun run inspect:memory` scripts for launching the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- `bun run build:app` script to bundle the xterm.js shell app into a single HTML file
- 74 unit tests covering providers, parser, all 17 commands, pipelines, redirects, and security

## [0.2.0] — 2026-05-12

### Added

- **5 extended tools** inspired by claude-code's filesystem tool surface:
  - `read_file_range` — read a slice of a text file by 1-based line offset and limit; returns a header showing the range and total line count
  - `grep_file` — regex search within a single object; returns matching lines prefixed with their 1-based line number
  - `grep_files` — regex search across all objects under a path; supports a glob filter, two output modes (`files_with_matches` and `content`), and a per-call `max_objects` override
  - `copy_file` — server-side copy within the same bucket; falls back to get+put for cross-bucket copies; evicts the destination cache entry after copy
  - `delete_file` — permanently delete an object and evict its cache entry (disabled by default — must be explicitly enabled)
- `--enable-delete` CLI flag — opt-in to register the `delete_file` tool (default: off for safety)
- `--grep-max-objects <n>` CLI flag — server-wide cap on the number of objects `grep_files` scans per call (default: 1000); can be overridden per-call via the `max_objects` parameter
- **Virtual Filesystem (VFS) layer** — FUSE-inspired write-back overlay providing immediate consistency:
  - In-memory inode table, directory index, and tombstone set ensure that unflushed writes are immediately visible to `list`, `stat`, `get`, and `search` operations
  - VFS metadata is persisted to the CacheStore (`__vfs__/*` keys) for warm-start recovery on server restarts (when using filesystem or Redis cache)
  - `VirtualFS.hydrate()` restores state on startup; corrupted data is silently discarded
- **npm library entrypoint** (`@nogoo9/mcp-server-cloud-fs`):
  - `createMcpServer()`, `VirtualFS`, all provider classes, all cache backends, and path utilities are exported for programmatic use
  - TypeScript declarations (`.d.ts`) and source maps are included in the published package
- VFS unit tests (13 tests covering get, stat, list, copy, tombstones, persistence round-trip)

### Changed

- All tool handlers refactored to use `VirtualFS` exclusively — `ServerContext` now provides `vfs` instead of `provider` + `cache`
- All tool unit tests updated to construct VFS-based contexts via shared `__test-helpers.ts`
- Build system migrated from Bun bundler to `tsc -p tsconfig.build.json` to emit proper declarations
- `package.json` now exports `main`/`types`/`exports` for library consumers

## [0.1.0] — 2026-04-27

### Added

- All 14 `mcp-server-filesystem` tools implemented over cloud object storage (same names, same parameter schemas)
- Provider support: AWS S3, Azure Blob Storage, Google Cloud Storage, S3-compatible backends (MinIO, RustFS)
- Transparent cache layer with memory, filesystem, and Redis backends
- Write debounce: writes land in cache immediately, flushed to provider after configurable delay
- SIGTERM/SIGINT handler flushes dirty cache entries synchronously before exit
- `--no-cache` flag for pass-through mode (every read/write goes directly to provider)
- Path validation matching `mcp-server-filesystem` security semantics (blocks `..` traversal, wrong-bucket access)
- CLI: `cloud-fs-mcp <s3|azure|gcs> <root-uri> [root-uri...] [options]`
