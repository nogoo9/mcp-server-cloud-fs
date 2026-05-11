# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — Unreleased

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
