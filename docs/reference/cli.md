# CLI Reference

```
cloud-fs-mcp <provider> <root-uri> [root-uri...] [options]
```

## Providers

| Provider | URI format | Description |
|---|---|---|
| `s3` | `s3://bucket[/prefix]` | AWS S3 or S3-compatible (MinIO, RustFS) |
| `azure` | `az://container[/prefix]` | Azure Blob Storage |
| `gcs` | `gs://bucket[/prefix]` | Google Cloud Storage |
| `memory` | `mem://name` | In-memory (ephemeral, for demos) |
| `sqlite` | `sqlite://name` | SQLite (persistent local) |

## Transport & Network

| Flag | Default | Description |
|---|---|---|
| `--transport <stdio\|http\|ws>` | `stdio` | Transport protocol |
| `--port <number>` | `3000` | Listen port (http/ws only) |
| `--host <address>` | `127.0.0.1` | Bind address (http/ws only) |

## Authentication

| Flag | Default | Description |
|---|---|---|
| `--auth <none\|builtin\|external>` | `none` | Auth mode (http/ws only) |
| `--auth-issuer <url>` | — | OAuth issuer URL (builtin mode) |
| `--auth-jwks-uri <url>` | — | JWKS URI (external mode) |
| `--auth-audience <string>` | — | Expected token audience (external mode) |
| `--auth-client-credentials` | `false` | Enable Client Credentials ext-auth flow |
| `--auth-enterprise-idp <url>` | — | Enable Enterprise-Managed Authorization |

## Production

| Flag | Default | Description |
|---|---|---|
| `--cors-origin <origin>` | — | Allowed CORS origin (repeatable) |
| `--rate-limit <req/min>` | `0` (off) | Rate limit per client |
| `--rate-limit-burst <n>` | `10` | Burst allowance |
| `--request-logging` | `false` | Enable structured JSON request logging |

## Storage & Cache

| Flag | Default | Description |
|---|---|---|
| `--region <region>` | — | Cloud region (S3, GCS) |
| `--endpoint <url>` | — | Custom endpoint for S3-compatible backends |
| `--cache-store <memory\|fs\|redis>` | `memory` | Cache backend |
| `--cache-ttl <seconds>` | `60` | Cache TTL in seconds |
| `--sync-debounce <ms>` | `2000` | Write flush delay in ms |
| `--cache-dir <path>` | — | Directory for fs cache store |
| `--no-cache` | — | Bypass cache entirely (pass-through mode) |
| `--gcs-endpoint <url>` | — | Custom endpoint for GCS |
| `--sqlite-db <path>` | — | SQLite database file path |

## Tools

| Flag | Default | Description |
|---|---|---|
| `--enable-delete` | `false` | Enable the `delete_file` tool |
| `--enable-shell` | `false` | Enable the `shell` tool |
| `--grep-max-objects <n>` | `1000` | Max objects `grep_files` scans per call |
| `--seed-demo` | `false` | Seed VFS with sample files for demo |

::: info
Credentials are always sourced from SDK credential chains — never CLI flags. See [Provider Setup](/guide/providers) for details.
:::
