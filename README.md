# @nogoo9/mcp-server-cloud-fs

[![CI](https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml/badge.svg)](https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@nogoo9/mcp-server-cloud-fs)](https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs)
![NPM Downloads](https://img.shields.io/npm/dm/%40nogoo%2Fmcp-server-cloud-fs)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm--Shield--1.0.0-blue)](LICENSE)

Drop-in cloud replacement for `mcp-server-filesystem` — 19 MCP tools (14 baseline + 5 extended), same schema, backed by S3, Azure Blob, or GCS.

![Amazon S3](https://img.shields.io/badge/Amazon_S3-569A31?logo=amazons3&logoColor=white)
![Azure Blob Storage](https://img.shields.io/badge/Azure_Blob_Storage-0078D4?logo=microsoftazure&logoColor=white)
![Google Cloud Storage](https://img.shields.io/badge/Google_Cloud_Storage-4285F4?logo=googlecloud&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-C72E49?logo=minio&logoColor=white)
![RustFS](https://img.shields.io/badge/RustFS-DEA584?logo=rust&logoColor=white)

## What it does

`@nogoo9/mcp-server-cloud-fs` exposes all 14 tools defined by [`mcp-server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — same tool names, same parameter schemas — over cloud object storage. Drop it into any MCP client config that currently points at `mcp-server-filesystem` and your AI assistant gains read/write access to S3, Azure Blob Storage, or Google Cloud Storage buckets.

In addition, v0.2.0 adds **5 extended tools** inspired by [claude-code's filesystem tool surface](https://github.com/codeaashu/claude-code/tree/main/src/tools): line-range reads, in-process regex search (single file and multi-file), server-side copy, and opt-in deletion.

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

> ✨ = Extended tool, added in v0.2.0

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
| Directory listing TTL | `TTL ÷ 4` (15 s) | _(derived — not separately configurable)_ |
| Pass-through (no cache) | off | `--no-cache` |

### How caching works

**Reads:** On a cache miss the object is fetched from the provider and stored under the key `scheme://bucket/key`. Subsequent reads within the TTL window are served entirely from cache with no provider calls.

**Writes:** `write_file` and `edit_file` write content into cache immediately and mark the entry *dirty*. A background debounce timer (default: 2 s) fires after the last write and flushes all dirty entries to the provider via `putObject`. This means rapid successive edits to the same file only cause a single provider write.

**Deletes:** `delete_file` calls `deleteObject` on the provider and immediately evicts the cache entry so subsequent reads reflect the deletion.

**Copy/move:** The destination entry is evicted from cache after `copy_file` / `move_file` so the next read re-fetches the freshly written content.

**Graceful shutdown:** On `SIGTERM` or `SIGINT`, all dirty cache entries are flushed to the provider synchronously before the process exits, preventing data loss.

**Pass-through mode:** `--no-cache` disables the cache entirely. Every read and write goes directly to the provider. Useful when you need strong read-after-write consistency or want to avoid stale data across multiple server instances.

---

## License

[PolyForm Shield 1.0.0](LICENSE). Free for any non-competitive use.
