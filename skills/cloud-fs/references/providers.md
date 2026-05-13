# Provider-specific config

cloud-fs supports six provider types. Each has its own credential
mechanism and URI shape. This file lives next to `config.md` — use it
to fill in the `args` / `env` for a `.mcp.json` entry once you know
which provider the user picked.

Credentials are **always** sourced from SDK credential chains, never
from CLI flags. The CLI takes endpoints, regions, and toggles.

---

## AWS S3

**URI**: `s3://bucket[/prefix]` (one or more)

**Credentials** (in priority order):
1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars
2. `~/.aws/credentials` (optionally `AWS_PROFILE` selects a profile)
3. EC2 / ECS / Lambda instance roles
4. SSO config via `aws sso login`

**Required flag**: `--region <region>` for any non-`us-east-1` bucket.

**.mcp.json template:**
```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3",
               "s3://my-bucket", "--region", "eu-west-1"]
    }
  }
}
```

For a non-default profile:
```json
"env": { "AWS_PROFILE": "prod-readonly" }
```

---

## S3-compatible (MinIO, RustFS, others)

**URI**: `s3://bucket[/prefix]` — same shape as AWS.

**Required flag**: `--endpoint <url>` plus a placeholder `--region`
(MinIO ignores it but the SDK requires one).

**Credentials**: same `AWS_*` env vars as AWS. Often static keys for
self-hosted setups.

**TLS with self-signed CA**: pass `--ca-file <path-to-pem>`. This flag
covers both the S3 endpoint **and** the Redis TLS connection (if you
also use `--cache-store redis` with `rediss://`).

**.mcp.json template:**
```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3",
               "s3://artifacts", "--endpoint",
               "http://minio.internal:9000", "--region", "us-east-1"],
      "env": {
        "AWS_ACCESS_KEY_ID": "minioadmin",
        "AWS_SECRET_ACCESS_KEY": "minioadmin"
      }
    }
  }
}
```

---

## Azure Blob Storage

**URI**: `az://container[/prefix]`

**Required env var**: `AZURE_STORAGE_CONNECTION_STRING`. The provider
will refuse to start without it. There is no CLI alternative.

A connection string looks like:
```
DefaultEndpointsProtocol=https;AccountName=foo;AccountKey=...;EndpointSuffix=core.windows.net
```

**.mcp.json template:**
```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "azure",
               "az://my-container"],
      "env": {
        "AZURE_STORAGE_CONNECTION_STRING": "DefaultEndpointsProtocol=https;..."
      }
    }
  }
}
```

If the user wants to keep the connection string out of `.mcp.json`,
have them export it in their shell before launching Claude Code — the
MCP server inherits the parent process env.

---

## Google Cloud Storage

**URI**: `gs://bucket[/prefix]`

**Credentials** (Application Default Credentials chain):
1. `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account JSON
2. `gcloud auth application-default login` (interactive)
3. Workload Identity (GKE / GCE / Cloud Run)

**Optional flag**: `--gcs-endpoint <url>` for fake-gcs-server or other
GCS-compatible emulators.

**.mcp.json template:**
```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "gcs",
               "gs://my-bucket"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/home/user/.config/gcp/sa.json"
      }
    }
  }
}
```

---

## In-memory (demo)

**URI**: `mem://name`

Zero-config, zero-credentials, lost on process exit. Useful for
showing what cloud-fs does without touching real cloud.

**.mcp.json template:**
```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "memory",
               "mem://demo", "--seed-demo"]
    }
  }
}
```

`--seed-demo` populates the VFS with sample README, CSV, JSON, log,
and source files — handy for the user to play with `ls`, `cat`,
`grep`, `find` immediately.

---

## SQLite (persistent local)

**URI**: `sqlite://name`

**Required flag**: `--sqlite-db <path-to-db-file>`. No default.

Uses `bun:sqlite` under Bun, falls back to `better-sqlite3` on Node.js
(install as peer dep if needed).

**.mcp.json template:**
```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "sqlite",
               "sqlite://my-bucket", "--sqlite-db",
               "/var/data/cloud-fs.db"]
    }
  }
}
```

---

## Optional tools (off by default for safety)

| Flag | Effect |
|---|---|
| `--enable-delete` | Adds the `delete_file` tool (otherwise `rm`-equivalent is unavailable) |
| `--enable-shell` | Adds a `shell` tool for full POSIX commands (only useful when the MCP client supports it; Claude Code does not currently expose it) |
| `--seed-demo` | Pre-populates the VFS — only meaningful with the `memory` provider |
| `--grep-max-objects <n>` | Raises the grep_files scan cap (default 1000) |

Append these to the `args` list when the user explicitly asks for them.
Mention the safety implication if you're enabling `delete_file` for
the first time.

---

## Cache (optional, advanced)

cloud-fs has a write-back cache for performance. Defaults are usually
fine — only touch this if the user complains about speed or wants
persistence.

| Flag | Default | Why touch it |
|---|---|---|
| `--cache-store memory` | yes | Default; lost on restart |
| `--cache-store fs --cache-dir <path>` | — | Persistent local cache |
| `--cache-store redis` | — | Distributed cache; reads `REDIS_URL` (use `rediss://` for TLS) |
| `--no-cache` | — | Bypass the cache entirely (lowest memory, highest latency) |
| `--cache-ttl <s>` | 60 | Tune freshness vs. read latency |
| `--sync-debounce <ms>` | 2000 | Tune write-back lag |

For Redis with a private CA: pass `--ca-file <pem>` — it covers Redis
TLS in addition to S3-compatible endpoints.
