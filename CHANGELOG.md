# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.7.0] — 2026-05-18

### Added

- **Dynamic tool surface reduction** — when `grantedScopes` is provided in `ServerContext`, only tools matching the session's OAuth scopes are registered. Read-only clients no longer see `write_file`, `delete_file`, or `shell` in `tools/list`, reducing prompt token overhead and preventing tool hallucination. Backwards-compatible: omitting scopes registers all tools. (#22)
- **DLP content sanitization middleware** — opt-in regex-based redaction of sensitive content (AWS keys, emails, SSN, credit cards, JWTs, API keys) from tool responses before they reach the MCP client. Ships 9 default patterns. Enabled via `--enable-dlp` CLI flag. (#23)
- **AI-native tools** — two new tools that extract structural metadata server-side to reduce LLM context token waste (#24):
  - `get_file_schema` — for CSV: column names, inferred types, sample values, row count; for JSON: root type, keys, shapes; for text: line/byte counts
  - `summarize_file` — compact head/tail summary with size, line count, and content type without full file reads
- **Optimistic concurrency control (ETags)** — SHA-256 content-addressable ETags computed on every `put()` and persisted in the inode overlay. `edit_file` accepts an optional `expected_etag` parameter for conflict detection. `read_text_file` includes the etag in response metadata. (#25)
- **`patch_file` macro tool** — apply unified diffs or line-range replacements atomically in a single tool call, combining the read→transform→write workflow. Supports optional `expected_etag` for concurrency safety. (#26)

### Changed

- `VfsStat` and `ObjectInfo` interfaces extended with optional `etag` field
- `read_text_file` responses now include `[etag: <hash>]` metadata suffix
- `edit_file` responses now include the new etag on success
- E2E test assertions updated to accommodate etag metadata in read responses
- Scope filter helpers (`getToolsForScopes`, `shouldRegisterTool`) exported from `src/auth/scopes.ts`

## [0.6.0] — 2026-05-15

### Added

- **Structured error handling** — `CloudError` class with typed error codes (`RATE_LIMITED`, `PERMISSION_DENIED`, `BUCKET_NOT_FOUND`, etc.) and provider-specific mappers for S3, Azure, and GCS. Errors include `provider`, `statusCode`, and `retryable` metadata for programmatic handling.
- **Byte-range reads (`read_file_chunk`)** — read specific byte ranges from cloud objects without downloading the entire file. Supports `utf8` and `base64` encodings, with a 10MB per-chunk safety limit.
- **Presigned URLs (`get_presigned_url`)** — generate temporary access URLs for cloud objects via AWS SDK presigners. Supports configurable expiration (default: 1 hour) and `get`/`put` operations.
- **Structured audit logging** — `AuditLogger` middleware with pluggable sinks (`StderrAuditSink`, `FileAuditSink`). Logs tool name, arguments (sanitized), duration, scope, resource URI, and outcome as structured JSON. Enabled via `--audit-log` / `--audit-log-file` CLI flags.
- **Object metadata & tag tools** — `get_object_metadata` returns size, content type, custom metadata, and tags. `set_object_tags` replaces tags on an object. `search_by_tag` lists objects matching tag filters (AND logic).
- **Object versioning tools** — `list_versions` returns version history with timestamps, sizes, and latest/delete markers. `restore_version` copies a previous version over the current one. Requires versioning-enabled storage.
- **MCP Resources** — cloud storage roots and paths exposed as browsable MCP Resources. Static root resources registered per configured root; dynamic resource template (`cloud-fs://{cloudPath}`) resolves to directory listings (JSON) or file content (UTF-8 / base64).
- **Connection health-check module** — `checkHealth()` probes authentication, list access, optional write access, and versioning support. `formatHealthReport()` produces terminal-friendly output. Server validates credentials at startup and exits with a diagnostic report on failure.
- **Multi-provider routing (`MultiProvider`)** — composite `StorageProvider` that routes operations to scheme-specific sub-providers, enabling a single server instance to serve S3 + Azure + GCS simultaneously. Zero VFS changes required.
- **Azure DefaultAzureCredential** — `AzureProvider` now supports Managed Identity, OIDC, and other federated auth flows when only `accountName` is provided. `@azure/identity` added as an optional peer dependency.

### Changed

- `StorageProvider` interface extended with optional methods: `getObjectMetadata`, `setObjectTags`, `getObjectTags`, `listObjectVersions`, `restoreObjectVersion`, `getPresignedUrl`. Providers that don't support these return clear error messages.
- `MemoryProvider` implements all optional methods (metadata, tags, versioning) for testing.
- Startup credential validation added — server verifies provider connectivity before accepting MCP connections.

## [0.5.0] — 2026-05-14

### Added

- **Interactive TUI (`cloud-fs`)** — new binary for terminal-based cloud storage exploration. Powered by `node:readline` with tab completion, persistent history (`~/.cloud-fs_history`), ANSI-colored UI, and a command queue for correct async sequencing. Runs on both Bun and Node.js.
- **`cd` command** — navigate directories within the virtual filesystem. Supports `cd <dir>`, `cd ..`, `cd /`, with prompt reflecting the current working directory. All 19 shell commands resolve paths relative to `cwd`.
- **`jq` command** — native, zero-dependency JSON processor for the shell. Supports key extraction, array indexing, nested paths, and piping from `cat`.
- **Relative path support** — all tools and shell commands resolve paths relative to the primary root prefix. `ls`, `find`, and other commands output relative paths by default for shell composability.
- **Config file support** — `cloud-fs.json` in CWD or `~/.config/cloud-fs/config.json` for persistent TUI configuration. CLI flags override config values.
- **`--seed-demo` flag** — pre-populate storage with sample files (README, config, CSV, logs) for immediate exploration.
- **`--ca-file <path>`** — PEM CA bundle for TLS verification of S3-compatible endpoints (MinIO, RustFS) and Redis (`rediss://`) using a private/self-signed CA. Injected directly into `ioredis` (`tls.ca`) and the S3 client (`NodeHttpHandler` + `https.Agent`). For runtime-wide CA trust (Azure, GCS, or all providers), use `NODE_EXTRA_CA_CERTS` instead.
- **AI agent skill (`skills/cloud-fs`)** — installable skill that teaches AI coding assistants (Claude Code, Gemini CLI, etc.) how to use cloud-fs as a POSIX-like virtual filesystem. Supports local installation via `skills add ./skills/cloud-fs` and remote installation via `npx skills add nogoo9/mcp-server-cloud-fs`. Includes MCP mode auto-detection, bootstrap flow, and POSIX-to-MCP tool mapping.

### Changed

- **SQLite provider: dual-runtime support** — uses `bun:sqlite` on Bun and `better-sqlite3` on Node.js. Constructor replaced with async factory `SqliteProvider.create()` (**breaking** for direct consumers of `SqliteProvider`).
- **Bootstrap refactor** — extracted `src/bootstrap.ts` to share VFS/provider/cache initialization between the MCP server and the TUI binary.
- **Shell path resolution** — introduced `resolveShellPath()` in `src/tools/shell/resolve.ts` to prepend `cwd` to relative paths, keeping `resolveToolPath` unchanged for non-shell tools.
- **`isAbsoluteUri` regex** — fixed `[a-z]+` → `[a-z][a-z0-9]*` to correctly handle schemes like `s3://`.
- **WebSocket transport** — replaced `any`-typed `bunServerRef` with a structural type for type safety.

### Security

- **Dependency audit** — resolved 12 of 13 `bun audit` vulnerabilities:
  - `hono` 4.12.15 → 4.12.18 (4 moderate + 1 low)
  - `fast-uri` 3.1.0 → 3.1.2 (2 high)
  - `fast-xml-builder` 1.1.5 → 1.2.0 (1 high + 1 moderate)
  - `ip-address` 10.1.0 → 10.2.0 (1 moderate)
  - `vitepress` 1.6.4 → 2.0.0-alpha.17, pulling `vite` 5 → 7 (path traversal in `.map` handling) and `esbuild` 0.21 → 0.27 (dev server CORS bypass)
  - Remaining 1 unfixable (low): `@tootallnate/once` — deeply nested in GCS/Azure SDK transitive deps
- **File inclusion fix** — sanitized file path handling in `scripts/docs-landing.ts` to prevent potential file inclusion attack; added 254-line test suite
- **Pinned GitHub Actions** — all 3rd-party actions in CI, docs, and publish workflows pinned to full commit SHA to prevent supply-chain attacks
- **Redis TLS warning** — runtime `console.warn` when `REDIS_URL` uses unencrypted `redis://` transport; recommends `rediss://` for production TLS connections
- **SAST remediation** — resolved all Semgrep findings (`p/security-audit`, `p/javascript`, `p/trailofbits`, `p/owasp-top-ten`, `p/cwe-top-25`):
  - Extracted `DEFAULT_REDIS_URL` constant to centralize the Redis fallback and eliminate pattern-match false positives
  - Added `nosemgrep` suppressions for intentional `redis://` string references in warning messages and E2E test fixtures
  - Replaced `Math.random()` with `crypto.randomInt()` / `crypto.randomBytes()` in test files for secure randomness
- **Security headers** — opt-in HTTP response hardening via [nosecone](https://github.com/arcjet/arcjet-js/tree/main/nosecone) (framework-agnostic, works with both Bun-native and Node/Express transports):
  - Sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, and other standard security headers
  - `--security-headers` flag enables nosecone with defaults
  - `--security-headers-config <json>` for inline JSON customization
  - `--security-headers-config-file <path>` to load configuration from a file
  - Headers are resolved once at startup and applied to every response (health checks, MCP, CORS preflight)
  - `nosecone` is an optional peer dependency — only required when the flag is used


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
