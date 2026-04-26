# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
