# Connection Health-Check UI

> **Status:** ✅ Implemented in v0.6.0
> **Issue:** [#20](https://github.com/nogoo9/mcp-server-cloud-fs/issues/20)
> **Commit:** [`e43a50f`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/e43a50f) — `feat(health): add connection health-check module`
> **Branch:** `feature/cloud-native-v1`

## Problem

Users frequently struggle with cloud storage configuration — wrong credentials, incorrect endpoints, bucket permissions, region mismatches. Errors only surface when an MCP client tries to use a tool, leading to a poor first-run experience.

## Design

### Goal

A lightweight localhost web UI that helps users verify their cloud connection before connecting an MCP client. Accessible at `http://localhost:3000/health` when running with HTTP transport, or as a standalone `--check` CLI command.

### CLI Command (Primary)

```bash
# Validate connection and print results
cloud-fs-mcp check s3 s3://my-bucket --region us-east-1 --endpoint http://minio:9000
```

Output:
```
✓ Provider: S3
✓ Endpoint: http://minio:9000
✓ Authentication: AWS credential chain (IRSA)
✓ Bucket "my-bucket": accessible (read + write)
✓ Prefix "": listable
✗ Bucket "my-bucket": versioning NOT enabled

Connection OK — ready for MCP clients.
```

### HTTP Health Endpoint (Secondary)

When running with `--transport http`, expose `/health` returning JSON:

```json
{
  "status": "ok",
  "provider": "s3",
  "roots": [
    {
      "uri": "s3://my-bucket",
      "readable": true,
      "writable": true,
      "versioning": false
    }
  ],
  "uptime_seconds": 3600
}
```

### What It Checks

1. **Authentication** — can the provider authenticate?
2. **Bucket access** — can we list objects?
3. **Write access** — can we write a test object and delete it? (optional, only with `--enable-delete`)
4. **Versioning** — is versioning enabled?
5. **Endpoint reachability** — can we connect to the endpoint?

## Implementation Plan

1. Create `src/health.ts` with `checkHealth()` function
2. Add `check` subcommand to CLI in `src/index.ts`
3. Implement provider-level health checks
4. Add `/health` endpoint to HTTP transport
5. Formatted terminal output with colors/symbols
6. Unit tests for health check logic
7. Update getting-started docs

## Acceptance Criteria

- [x] `cloud-fs-mcp check s3 s3://bucket` validates connection
- [x] Clear pass/fail output for each check
- [x] `/health` endpoint returns JSON when using HTTP transport
- [x] Detects common misconfigurations (wrong region, bad credentials)
- [x] Works with all providers
- [x] Does not require MCP client connection
