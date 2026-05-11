# @nogoo9/mcp-server-cloud-fs

[![CI](https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml/badge.svg)](https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/nogoo9/mcp-server-cloud-fs/badge.svg?branch=main)](https://coveralls.io/github/nogoo9/mcp-server-cloud-fs?branch=main)
[![npm](https://img.shields.io/npm/v/@nogoo9/mcp-server-cloud-fs)](https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs)
![NPM Downloads](https://img.shields.io/npm/dm/%40nogoo%2Fmcp-server-cloud-fs)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm--Shield--1.0.0-blue)](LICENSE)

Cloud replacement for `mcp-server-filesystem` — 19 tools for S3, Azure Blob, and GCS. Also available as an npm library.

![Amazon S3](https://img.shields.io/badge/Amazon_S3-569A31?logo=amazons3&logoColor=white)
![Azure Blob Storage](https://img.shields.io/badge/Azure_Blob_Storage-0078D4?logo=microsoftazure&logoColor=white)
![Google Cloud Storage](https://img.shields.io/badge/Google_Cloud_Storage-4285F4?logo=googlecloud&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-C72E49?logo=minio&logoColor=white)
![RustFS](https://img.shields.io/badge/RustFS-DEA584?logo=rust&logoColor=white)

## What it does

`@nogoo9/mcp-server-cloud-fs` exposes all 14 tools defined by [`mcp-server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — same tool names, same parameter schemas — over cloud object storage. Drop it into any MCP client config that currently points at `mcp-server-filesystem` and your AI assistant gains read/write access to S3, Azure Blob Storage, or Google Cloud Storage buckets.

It also includes **5 extended tools** inspired by [claude-code's filesystem tool surface](https://github.com/codeaashu/claude-code/tree/main/src/tools): line-range reads, in-process regex search (single file and multi-file), server-side copy, and opt-in deletion.

A **Virtual Filesystem (VFS) layer** provides FUSE-like cache coherence, and the package is available as a **programmatic npm library**.

## Quick start

```bash
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket
```

## CLI reference

```
cloud-fs-mcp <provider> <root-uri> [root-uri...] [options]

Providers:   s3 | azure | gcs

Options:
  --region <region>                 Cloud region (S3, GCS)
  --endpoint <url>                  Custom endpoint for S3-compatible backends (MinIO, RustFS)
  --cache-store <memory|fs|redis>   Cache backend (default: memory)
  --cache-ttl <seconds>             Cache TTL in seconds (default: 60)
  --sync-debounce <ms>              Write flush delay in ms (default: 2000)
  --cache-dir <path>                Directory for fs cache store
  --no-cache                        Bypass cache entirely (pass-through mode)
  --enable-delete                   Enable the delete_file tool (disabled by default)
  --grep-max-objects <n>            Max objects grep_files scans per call (default: 1000)
  --gcs-endpoint <url>              Custom endpoint for GCS (e.g. fake-gcs-server)
```

Credentials are always sourced from SDK credential chains — never CLI flags.

## Provider setup

### AWS S3

Credentials are read from the standard AWS credential chain: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars, `~/.aws/credentials`, EC2 instance profiles, and so on.

```bash
cloud-fs-mcp s3 s3://my-bucket --region us-east-1
```

### S3-compatible (MinIO, RustFS)

Pass `--endpoint` to target any S3-compatible backend:

```bash
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
cloud-fs-mcp s3 s3://my-bucket --endpoint http://minio:9000 --region us-east-1
```

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

## MCP client config

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

---

## Programmatic usage (npm library)

The server is also available as a programmatic library for embedding in your own applications:

```ts
import {
  createMcpServer,
  VirtualFS,
  MemoryStore,
  S3Provider,
  parseUri,
} from "@nogoo9/mcp-server-cloud-fs";

const roots  = [parseUri("s3://my-bucket")];
const provider = new S3Provider({ region: "us-east-1" });
const cache    = new MemoryStore(provider, { ttlMs: 60_000, syncDebounceMs: 2000 });
const vfs      = new VirtualFS(provider, cache);
await vfs.hydrate();                     // restore persisted metadata

const server = createMcpServer({ vfs, roots });
// Connect to your transport of choice
```

### Exported types & classes

| Export | Description |
|---|---|
| `createMcpServer(ctx)` | Create a configured MCP server instance |
| `VirtualFS` | FUSE-inspired write-back overlay (see Architecture below) |
| `MemoryStore`, `FilesystemStore`, `createRedisStore`, `PassThroughCache` | Cache backends |
| `S3Provider`, `AzureProvider`, `GcsProvider` | Storage provider implementations |
| `parseUri`, `toCacheKey`, `resolveToolPath` | Path utilities |

---

## Tool reference

All paths are cloud URIs — e.g. `s3://my-bucket/path/to/file.txt`. The server validates every path against the configured root URIs at startup; requests outside allowed roots are rejected.

### Read tools

| Tool | Parameters | Description |
|---|---|---|
| `read_file` | `path` | Read a file and return its content. Binary files are returned as base64; text files as UTF-8. |
| `read_text_file` | `path`, `head?`, `tail?` | Read a text file as UTF-8. `head: N` returns the first N lines; `tail: N` returns the last N lines. Omit both for the full file. |
| `read_media_file` | `path` | Read an image or media file and return it as a base64-encoded MCP image content block with the correct MIME type. |
| `read_multiple_files` | `paths` | Read several files in parallel. Each result is returned independently; a failure on one file does not abort the others. |
| `read_file_range` ✨ | `path`, `offset`, `limit` | Read a contiguous slice of a text file. `offset` is **1-based** (offset 1 = first line). Returns the requested lines and a header showing the range and total line count. |

### Write tools

| Tool | Parameters | Description |
|---|---|---|
| `write_file` | `path`, `content` | Write (or overwrite) a file. Content lands in cache immediately and is flushed to the provider after the sync-debounce window (default: 2 s). |
| `edit_file` | `path`, `edits[]`, `dryRun?` | Apply one or more `{ oldText, newText }` edits sequentially to a file. Pass `dryRun: true` to preview the result without writing. Returns an error if any `oldText` is not found. |

### Directory tools

| Tool | Parameters | Description |
|---|---|---|
| `create_directory` | `path` | Create a "directory" (trailing-slash object placeholder) and any missing parent prefixes. |
| `list_directory` | `path` | List the immediate children of a path — files and subdirectories — similar to `ls`. |
| `list_directory_with_sizes` | `path`, `sortBy?`, `limit?` | List immediate children with file sizes. `sortBy: "size"` sorts descending; default is ascending by name. `limit` caps the number of results. |
| `directory_tree` | `path`, `excludePatterns?` | Recursively list a directory as a tree. Pass `excludePatterns` (glob strings) to skip matching paths. |

### Move tool

| Tool | Parameters | Description |
|---|---|---|
| `move_file` | `source`, `destination` | Move a file. Same-bucket moves use a server-side copy + delete (efficient). Cross-bucket moves download then re-upload the content. Cache entries are updated on both sides. |

### Search tools

| Tool | Parameters | Description |
|---|---|---|
| `search_files` | `path`, `pattern`, `excludePatterns?` | List all objects under `path` whose keys match a glob `pattern` (e.g. `**/*.json`). Optionally exclude paths matching `excludePatterns`. |
| `grep_file` ✨ | `path`, `pattern`, `case_insensitive?` | Regex search within a single file. Returns matching lines prefixed with their 1-based line number (e.g. `42:matched line`). |
| `grep_files` ✨ | `path`, `pattern`, `glob?`, `case_insensitive?`, `output_mode?`, `max_objects?` | Regex search across all objects under `path`. Optional `glob` narrows the candidate set. `output_mode: "files_with_matches"` (default) returns matching file URIs; `"content"` returns matching lines with a `uri:lineNo:` prefix. Scans at most `max_objects` objects (server default: 1000; override per-call). |

### Copy & Delete tools

| Tool | Parameters | Description |
|---|---|---|
| `copy_file` ✨ | `source`, `destination` | Copy a file. Same-bucket copies use a server-side copy (efficient); cross-bucket copies download then re-upload. The destination cache entry is evicted after copy so the next read reflects the new content. |
| `delete_file` ✨ | `path` | Permanently delete a file and evict its cache entry. **Only available when the server is started with `--enable-delete`.** |

### Info tools

| Tool | Parameters | Description |
|---|---|---|
| `get_file_info` | `path` | Return metadata for a file: size in bytes, last-modified timestamp, and content type (where available). |
| `list_allowed_directories` | _(none)_ | Return the list of configured root URIs. Useful for the model to know which paths it is allowed to access. |

> ✨ = Extended tool

---

## Architecture: Virtual Filesystem (VFS)

All tool operations are mediated through a **Virtual Filesystem (VFS)** layer inspired by [FUSE](https://en.wikipedia.org/wiki/Filesystem_in_Userspace). This eliminates stale-read bugs and provides immediate consistency.

### Why a VFS?

In earlier versions, directory listings and metadata queries bypassed the write cache. A file written via `write_file` might not appear in a `list_directory` call until the debounce timer flushed it to the provider. The VFS fixes this by acting as the **single source of truth** for all operations.

### How it works

```
┌─────────────────────────────────────────────────────────┐
│  MCP Tool Handlers (read, write, list, stat, …)         │
│  ⇣  All operations go through the VFS                   │
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
│  ⇣ Content cache + dirty tracking + debounce flush      │
├─────────────────────────────────────────────────────────┤
│  StorageProvider (S3 / Azure Blob / GCS)                │
└─────────────────────────────────────────────────────────┘
```

**Three overlay structures:**

| Structure | Purpose |
|---|---|
| **Inodes** (`Map<cacheKey, VfsStat>`) | Metadata (size, lastModified, contentType) for every object written through the VFS. Used by `stat()` and `list()` to avoid provider round-trips. |
| **DirIndex** (`Map<dirKey, Set<objectKey>>`) | Parent-prefix → child-keys mapping. Ensures that `list_directory` and `search_files` see unflushed writes immediately. Only tracks session-local additions (additive). |
| **Tombstones** (`Set<cacheKey>`) | Cache keys of objects removed through the VFS. Guarantees that `list`, `stat`, and `get` calls correctly exclude deleted objects even before the provider processes the delete. |

### Resolution order

| Operation | Resolution |
|---|---|
| **`get()`** (read) | Cache hit → return. Tombstoned → throw. Else → provider fallback (+ cache fill). |
| **`stat()`** (metadata) | Inode overlay → cached content size → provider `headObject`. |
| **`list()`** (directory) | Provider listing – tombstones + overlay dirIndex entries. |
| **`put()`** (write) | Cache set + markDirty + inode update + dirIndex registration. Immediate visibility. |
| **`remove()`** (delete) | Provider deleteObject + cache evict + tombstone + inode/dirIndex cleanup. Immediate invisibility. |
| **`copy()`** | Same-bucket: server-side copy + inode derivation. Cross-bucket: get + put. |

### Metadata persistence

The inode table, dirIndex, and tombstone set are serialized to the `CacheStore` under well-known keys (`__vfs__/inodes`, `__vfs__/dirIndex`, `__vfs__/tombstones`). This means:

- **Memory cache:** VFS state lives only for the process lifetime.
- **Filesystem or Redis cache:** VFS state survives server restarts, providing warm-start consistency.

On startup, `VirtualFS.hydrate()` loads any persisted metadata. Corrupted data is silently discarded (safe cold start).

---

## Caching

All reads and writes are routed through a transparent cache layer to reduce round-trips to cloud storage.

### Cache backends

| Backend | CLI flag | Notes |
|---|---|---|
| **Memory** (default) | `--cache-store memory` | In-process LRU-style store. Fast, zero dependencies. Not shared across processes and does not survive restarts. |
| **Filesystem** | `--cache-store fs --cache-dir /path/to/cache` | Stores each entry as a file on disk. Survives process restarts. `--cache-dir` is required when using this backend. |
| **Redis** | `--cache-store redis` | Uses a Redis instance. Set `REDIS_URL` env var (default: `redis://localhost:6379`). Requires the optional `ioredis` peer dependency. |

### Cache defaults

| Setting | Default | CLI flag |
|---|---|---|
| Cache backend | `memory` | `--cache-store <memory\|fs\|redis>` |
| Entry TTL | 60 seconds | `--cache-ttl <seconds>` |
| Write debounce | 2000 ms | `--sync-debounce <ms>` |
| Pass-through (no cache) | off | `--no-cache` |

### How caching works

**Reads:** On a cache miss the object is fetched from the provider and stored under the key `scheme://bucket/key`. Subsequent reads within the TTL window are served entirely from cache with no provider calls. The VFS inode overlay ensures that `stat()` and `list()` calls also reflect cached content.

**Writes:** `write_file` and `edit_file` write content into cache immediately via `VFS.put()` and mark the entry *dirty*. A background debounce timer (default: 2 s) fires after the last write and flushes all dirty entries to the provider via `putObject`. This means rapid successive edits to the same file only cause a single provider write. The VFS inode and dirIndex are updated synchronously, so the file is immediately visible to `list`, `stat`, and `get`.

**Deletes:** `delete_file` calls `deleteObject` on the provider and immediately tombstones the key in the VFS. Subsequent reads, listings, and stat calls correctly exclude the deleted object.

**Copy/move:** Same-bucket copies use efficient server-side operations. The destination inode is derived from the source, and the dirIndex is updated immediately.

**Graceful shutdown:** On `SIGTERM` or `SIGINT`, all dirty cache entries are flushed to the provider synchronously before the process exits, preventing data loss.

**Pass-through mode:** `--no-cache` disables the cache entirely. Every read and write goes directly to the provider. The VFS overlay still provides session-level consistency for metadata.

---

## License

[PolyForm Shield 1.0.0](LICENSE). Free for any non-competitive use.
