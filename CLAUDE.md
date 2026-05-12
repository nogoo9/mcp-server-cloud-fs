# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

`mcp-server-cloud-fs` is a TypeScript/Bun CLI and MCP server that mirrors the `mcp-server-filesystem` tool API (all 14 tools, same names and parameter schemas) for cloud object storage — AWS S3, Azure Blob Storage, Google Cloud Storage, and S3-compatible backends (MinIO, RustFS). Published to npm as `@nogoo9/mcp-server-cloud-fs`; invoked via `npx @nogoo9/mcp-server-cloud-fs`.

The design spec in `docs/superpowers/specs/2026-04-26-cloud-fs-mcp-design.md` is the authoritative reference during initial implementation.

## Commands

```bash
# Install dependencies
bun install

# Build (outputs to dist/index.js and dist/lib.js)
bun run build

# Build the xterm.js shell app (outputs to dist/app/shell-app.html)
bun run build:app

# Type check
bun run typecheck

# Lint (Biome)
bun run lint

# Format / auto-fix (Biome)
bun run check

# Run unit tests
bun test

# Run a single test file
bun test src/tools/read.test.ts

# Run E2E tests (HTTP transport, auth, rate limiting)
bun run test:e2e

# Run integration tests (requires provider emulators)
bun run infra:up
bun run test:integration

# Tear down emulators
bun run infra:down

# Launch MCP Inspector against in-memory provider with demo content
bun run inspect:memory
```

## Toolchain

Proto pins the Bun version via `.prototools`. Run `proto use` to install the pinned version. Linting/formatting uses Biome (`biome.json`), not ESLint/Prettier.

## Architecture

### Entry and server registration
`src/index.ts` parses CLI args and instantiates the provider, cache store, and `ParsedRoot[]`, then builds a `VirtualFS`, calls `createMcpServer()` from `src/server.ts`, and starts the selected transport. `server.ts` registers all tools with their MCP schemas by delegating to per-group register functions in `src/tools/`.

### StorageProvider
`src/providers/interface.ts` defines the seven-method interface (`getObject`, `putObject`, `deleteObject`, `copyObject`, `headObject`, `listObjects`, `createPrefix`). Five implementations live in `src/providers/`: `S3Provider` (AWS + S3-compatible), `AzureProvider` (requires `AZURE_STORAGE_CONNECTION_STRING` env var), `GcsProvider`, `MemoryProvider` (ephemeral, for demos), `SqliteProvider` (persistent local file).

### VirtualFS
`src/vfs.ts` is the single access point for all tool handlers. It is a FUSE-inspired write-back overlay that maintains an in-memory inode table, directory index, and tombstone set on top of the backing `StorageProvider` and `CacheStore`. `vfs.hydrate()` reloads persisted metadata on startup; `vfs.flush()` drains dirty entries synchronously (called on `SIGTERM`/`SIGINT`).

### CacheStore
`src/cache/interface.ts` defines the cache contract. Writes go to cache first (mark dirty, return immediately); a debounced timer flushes dirty entries to the provider in parallel. Four backends: `MemoryStore`, `FilesystemStore`, `RedisStore` (peer dep: `ioredis`, URL via `REDIS_URL`), and `PassThroughCache` (`--no-cache`). Directory listing results are cached at `TTL / 4`. Cache keys are canonical URIs (`s3://bucket/key`, `az://container/key`, `gs://bucket/key`).

### Tool modules
`src/tools/` groups tools by function: `read.ts`, `write.ts`, `directory.ts`, `move.ts`, `search.ts`, `info.ts`, `extended.ts`. Each file exports a `register*Tools` function and calls only `VirtualFS` methods — the provider and cache are transparent. `edit_file` reads via `vfs.get`, applies edits in memory, and writes via `vfs.put`; it supports `dryRun` diff output.

### Shell tool
`src/tools/shell/` implements a POSIX-like interactive shell with 17 built-in commands (ls, cat, grep, find, head, tail, wc, echo, cp, mv, rm, mkdir, touch, sort, uniq, pipe, redirect). `parser.ts` handles `|` pipe chains and `>`, `>>`, `<` redirects. `registry.ts` maps command names to handlers. The optional xterm.js MCP App (`src/app/`) is built separately with `bun run build:app`.

### Transports
`src/transports/` provides three transport backends behind a `ManagedTransport` interface. `stdio.ts` is the default for local MCP clients. `http.ts` is Streamable HTTP (Express 5); `ws.ts` is WebSocket. `createTransport()` in `index.ts` dynamically imports the right backend. Auth middleware lives in `src/auth/` (OAuth 2.1 scopes, JWKS token verification, ext-auth Client Credentials, Enterprise IdP). Rate limiting is in `src/middleware/rate-limit.ts`.

### Path validation
`src/path-utils.ts` validates every tool path against the configured roots. Paths outside a root (including `..` traversal or wrong bucket) return the fixed string `"Access denied: path is outside allowed roots"` — matching `mcp-server-filesystem` verbatim.

### npm library entry point
`src/lib.ts` is the programmatic API (`dist/lib.js`). It re-exports providers, cache stores, `VirtualFS`, `createMcpServer`, transport types, auth utilities, and `executeShell` for use as a library dependency.

### CLI
```
cloud-fs-mcp <s3|azure|gcs|memory|sqlite> <root-uri> [root-uri...] [options]
```
Credentials always come from SDK credential chains (env, `~/.aws`, `DefaultAzureCredential`, ADC) — never CLI flags. Non-secret config (`--transport`, `--port`, `--host`, `--auth`, `--cors-origin`, `--rate-limit`, `--region`, `--endpoint`, `--cache-store`, `--cache-ttl`, `--sync-debounce`, `--cache-dir`, `--no-cache`, `--enable-delete`, `--enable-shell`, `--grep-max-objects`, `--seed-demo`) is passed as flags.

## Releasing

When bumping the version for a new release, update `version` in **both** `package.json` and `server.json` to keep the MCP registry listing in sync. After publishing to npm, run `npx mcp-publisher publish` to push the updated `server.json` to the MCP registry.

## Testing

TDD: write unit tests before implementation. Unit tests use a mock `StorageProvider` (no cloud calls).

### Test tiers

| Tier | Command | What it tests | Requires infra? |
|---|---|---|---|
| **Unit** | `bun run test` | Tool handlers, cache backends, VFS, path security, auth scopes, rate limiter | No |
| **Integration** | `bun run test:integration` | Provider implementations against emulator containers | Yes (Docker) |
| **E2E (HTTP)** | `bun run test:e2e:http` | HTTP transport, health checks, tool operations over HTTP | No |
| **E2E (Infra)** | `bun run test:e2e:infra` | Full MCP server over STDIO with MinIO + Redis | Yes (Docker) |
| **E2E (All)** | `bun run test:e2e` | Both HTTP and infra E2E suites | Yes (Docker) |
| **All** | `bun run test:all` | Every test file across all tiers | Yes (Docker) |

### Running tests

```bash
# Unit tests (fast, no infra)
bun run test

# HTTP E2E (spawns server as child process, memory provider)
bun run test:e2e:http

# Full E2E (requires Docker services)
bun run infra:up
bun run test:e2e
bun run infra:down
```

### E2E test files

- `src/server.e2e.test.ts` — STDIO transport + MinIO (S3) + Redis cache
- `src/transports/http.e2e.test.ts` — HTTP transport + memory provider (zero infra)

### Key conventions

- Integration tests in `src/providers/*.integration.test.ts` skip gracefully if emulators are unreachable.
- Path security tests in `src/path-utils.test.ts` must cover `..` traversal, wrong-bucket, and cross-prefix access.
- Auth scope tests in `src/auth/scopes.test.ts` validate tool-to-scope mapping and admin override.
- Rate limiter tests in `src/middleware/rate-limit.test.ts` cover burst, refill, per-client isolation.

## Documentation Diagrams

Documentation images in `docs/public/images/` are AI-generated diagrams. Every image in the docs markdown must have a **hidden prompt comment** directly above it so that future LLMs can regenerate the diagram if the architecture changes.

### Convention

Use an HTML comment with the `@image-prompt` tag:

```markdown
<!-- @image-prompt <filename>.png: <full generation prompt describing the diagram> -->
![Alt text](/images/<filename>.png)
```

For YAML frontmatter (e.g., hero images in `index.md`), use a YAML comment:

```yaml
  # @image-prompt <filename>.png: <full generation prompt>
  image:
    src: /images/<filename>.png
```

### Rules

- When updating a diagram, **always update the `@image-prompt` comment** to match the new content.
- When adding a new diagram, always include the prompt comment above it.
- Prompts should be detailed enough that an LLM image generator can reproduce the diagram accurately.
- All diagrams use a consistent dark navy background (`#1a1a2e`) with modern flat design and white text.
