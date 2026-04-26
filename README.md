# @nogoo9/mcp-server-cloud-fs

[![CI](https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml/badge.svg)](https://github.com/nogoo9/mcp-server-cloud-fs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@nogoo9/mcp-server-cloud-fs)](https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs)
![NPM Downloads](https://img.shields.io/npm/dm/%40nogoo%2Fmcp-server-cloud-fs)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm--Shield--1.0.0-blue)](LICENSE)

Drop-in cloud replacement for `mcp-server-filesystem` — all 14 MCP tools, same schema, backed by S3, Azure Blob, or GCS.

![Amazon S3](https://img.shields.io/badge/Amazon_S3-569A31?logo=amazons3&logoColor=white)
![Azure Blob Storage](https://img.shields.io/badge/Azure_Blob_Storage-0078D4?logo=microsoftazure&logoColor=white)
![Google Cloud Storage](https://img.shields.io/badge/Google_Cloud_Storage-4285F4?logo=googlecloud&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-C72E49?logo=minio&logoColor=white)
![RustFS](https://img.shields.io/badge/RustFS-DEA584?logo=rust&logoColor=white)

## What it does

`@nogoo9/mcp-server-cloud-fs` exposes all 14 tools defined by [`mcp-server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — same tool names, same parameter schemas — over cloud object storage. Drop it into any MCP client config that currently points at `mcp-server-filesystem` and your AI assistant gains read/write access to S3, Azure Blob Storage, or Google Cloud Storage buckets.

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

## Caching

All reads and writes are routed through a transparent cache layer to reduce round-trips to cloud storage.

| Backend | Flag | Notes |
|---------|------|-------|
| Memory (default) | `--cache-store memory` | In-process; no persistence across restarts |
| Filesystem | `--cache-store fs --cache-dir /tmp/cloud-fs-cache` | Survives restarts |
| Redis | `--cache-store redis` | Set `REDIS_URL` (default: `redis://localhost:6379`) |

**Write debounce:** Writes land in cache immediately and are flushed to the provider after `--sync-debounce` ms (default: 2000). On `SIGTERM`/`SIGINT` the buffer is synchronously flushed before exit.

**Disable caching:** Pass `--no-cache` for pass-through mode — every read and write goes directly to the provider.

## License

[PolyForm Shield 1.0.0](LICENSE). Free for any non-competitive use.
