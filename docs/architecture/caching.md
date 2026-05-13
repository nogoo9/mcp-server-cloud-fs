# Caching

The cache layer sits between the VFS and the storage provider, reducing latency and cloud API costs.

## Cache Backends

| Backend | Flag | Notes |
|---|---|---|
| **Memory** (default) | `--cache-store memory` | In-process, fast, not shared, not persistent. |
| **Filesystem** | `--cache-store fs --cache-dir <path>` | Survives restarts. |
| **Redis** | `--cache-store redis` | Shared, persistent. Requires `ioredis` peer dep. `REDIS_URL` env var. Use `rediss://` for TLS. |

::: warning Redis TLS
When `REDIS_URL` uses the unencrypted `redis://` scheme, the server emits a warning at startup recommending `rediss://` for TLS in production. Local development with `redis://localhost:6379` is fine, but production deployments should always use TLS-encrypted connections.
:::

## Write Path

Writes land in cache immediately (marked dirty), then flushed to the provider after the debounce window (default: 2s). This provides:

1. **Immediate visibility** — reads after writes see the new data instantly
2. **Batched flushes** — multiple rapid writes to the same file are coalesced
3. **Graceful shutdown** — `vfs.flush()` ensures all dirty entries reach the provider

## Read Path

1. Check VFS inode table (in-memory overlay)
2. Check cache store (Memory/FS/Redis)
3. On miss → fetch from storage provider → store in cache

## Configuration

```bash
# Default: in-memory cache with 60s TTL
cloud-fs-mcp s3 s3://my-bucket

# Filesystem cache (survives restarts)
cloud-fs-mcp s3 s3://my-bucket --cache-store fs --cache-dir /tmp/cloud-fs-cache

# Redis cache (local development)
REDIS_URL=redis://localhost:6379 \
cloud-fs-mcp s3 s3://my-bucket --cache-store redis

# Redis cache (production — TLS encrypted)
REDIS_URL=rediss://my-redis.example.com:6380 \
cloud-fs-mcp s3 s3://my-bucket --cache-store redis

# No cache (pass-through mode)
cloud-fs-mcp s3 s3://my-bucket --no-cache

# Custom TTL and debounce
cloud-fs-mcp s3 s3://my-bucket --cache-ttl 120 --sync-debounce 5000
```

## Pass-Through Mode

`--no-cache` sends every operation directly to the provider. Useful for debugging or when the provider already has low latency (e.g., local MinIO).

::: warning
Pass-through mode disables write coalescing. Each `write_file` call immediately writes to the provider.
:::
