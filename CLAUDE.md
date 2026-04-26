# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

`mcp-server-cloud-fs` is a TypeScript/Bun CLI and MCP server that mirrors the `mcp-server-filesystem` tool API (all 14 tools, same names and parameter schemas) for cloud object storage — AWS S3, Azure Blob Storage, Google Cloud Storage, and S3-compatible backends (MinIO, RustFS). Published to npm as `@nogoo9/mcp-server-cloud-fs`; invoked via `npx @nogoo9/mcp-server-cloud-fs`.

The design spec in `docs/superpowers/specs/2026-04-26-cloud-fs-mcp-design.md` is the authoritative reference during initial implementation.

## Commands

```bash
# Install dependencies
bun install

# Build (outputs to dist/index.js)
bun run build

# Type check
bun run typecheck

# Run all tests
bun test

# Run a single test file
bun test src/tools/read.test.ts

# Run integration tests (requires provider emulators — see infra/docker-compose.yml)
docker compose -f infra/docker-compose.yml up -d
bun run test:integration
```

## Toolchain

Proto pins the Bun version via `.prototools`. Run `proto use` to install the pinned version.

## Architecture

### Entry and server registration
`src/index.ts` parses CLI args and instantiates the provider, cache store, and `ParsedRoot[]`, then calls `createMcpServer()` from `src/server.ts`. `server.ts` registers all 14 tools with their MCP schemas.

### StorageProvider
`src/providers/interface.ts` defines the seven-method interface. `S3Provider` covers both AWS and S3-compatible backends (optional endpoint override). `createPrefix` writes a zero-byte trailing-slash object to represent empty directories.

### CacheStore and write path
Cache keys are canonical URIs (`s3://bucket/key`, `az://container/key`, `gs://bucket/key`). Writes go to cache first (mark dirty, return immediately); a debounced timer flushes dirty entries to the provider in parallel. `SIGTERM`/`SIGINT` triggers a synchronous flush. Directory listing results are cached at `TTL / 4`. `--no-cache` disables the layer entirely.

### Tool modules
Each file under `src/tools/` handles a group of related tools and calls only `StorageProvider` methods — caching is transparent. `edit_file` reads via `getObject`, applies edits in memory, writes via `putObject`, and supports `dryRun` diff output.

### Path validation
`src/path-utils.ts` validates every tool path against the configured roots. Paths outside a root (including `..` traversal or wrong bucket) return the fixed string `"Access denied: path is outside allowed roots"` — matching `mcp-server-filesystem` verbatim.

### CLI
```
cloud-fs-mcp <s3|azure|gcs> <root-uri> [root-uri...] [options]
```
Credentials always come from SDK credential chains (env, `~/.aws`, DefaultAzureCredential, ADC) — never CLI flags. Non-secret config (`--region`, `--endpoint`, `--cache-store`, `--cache-ttl`, `--sync-debounce`, `--cache-dir`, `--no-cache`) is passed as flags.

## Releasing

When bumping the version for a new release, update `version` in **both** `package.json` and `server.json` to keep the MCP registry listing in sync. After publishing to npm, run `npx mcp-publisher publish` to push the updated `server.json` to the MCP registry.

## Testing

TDD: write unit tests before implementation. Unit tests use a mock `StorageProvider` (no cloud calls). Integration tests in `src/providers/*.integration.test.ts` are skipped unless provider env vars are set and run against the emulators in `infra/docker-compose.yml`. Path security tests in `src/path-utils.test.ts` must cover `..` traversal, wrong-bucket, and cross-prefix access.
