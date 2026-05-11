# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
