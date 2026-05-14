# Multi-Provider Routing ("Cloud Hub")

## Problem

Currently, a single server instance is locked to **one** provider type (S3 OR Azure OR GCS). Users managing multi-cloud environments need separate server instances for each provider. This is operationally complex and wastes resources.

## Design

### Goal

A single `cloud-fs-mcp` instance routes requests to the correct provider based on the URI scheme:

```bash
cloud-fs-mcp multi s3://prod-data az://backups gs://ml-models
```

### Architecture

The current design already supports **multiple roots** (multiple buckets of the same provider). The change is to allow **mixed schemes** in the root list and instantiate one provider per scheme:

```typescript
// src/index.ts — multi-provider mode
const providerMap = new Map<string, StorageProvider>();

for (const root of roots) {
  if (!providerMap.has(root.scheme)) {
    providerMap.set(root.scheme, createProvider(root.scheme, args));
  }
}
```

### VFS Impact

The VFS is already scheme-agnostic — it uses `toCacheKey(root, key)` which includes the scheme. The `StorageProvider` is passed at construction. For multi-provider, the VFS would need a provider **resolver**:

```typescript
// Option A: Provider-per-root VFS wrapper
class MultiProviderVFS {
  private vfsMap = new Map<string, VirtualFS>();
  
  resolveVfs(root: ParsedRoot): VirtualFS {
    return this.vfsMap.get(root.uri) ?? this.vfsMap.get(root.scheme)!;
  }
}

// Option B: Provider resolver function (simpler)
const vfs = new VirtualFS(
  { getProvider: (root) => providerMap.get(root.scheme)! },
  cache,
);
```

Option B is simpler and requires changing VFS to accept a provider resolver instead of a single provider instance.

### CLI Changes

```bash
# Current: provider name is required as first arg
cloud-fs-mcp s3 s3://bucket1 s3://bucket2

# New: "multi" keyword enables multi-provider mode
cloud-fs-mcp multi s3://bucket1 az://container1 gs://bucket2

# Provider-specific options use scheme prefix
cloud-fs-mcp multi s3://bucket1 az://container1 \
  --s3-region us-west-2 \
  --s3-endpoint http://minio:9000
```

## Implementation Plan

1. Refactor `VirtualFS` constructor to accept a provider resolver function
2. Add `multi` provider mode to CLI parser
3. Instantiate providers per-scheme from root URIs
4. Per-scheme CLI options (e.g., `--s3-region`, `--s3-endpoint`)
5. Ensure all tools resolve the correct provider via root scheme
6. Unit tests: multi-provider VFS routing
7. E2E test: S3 + Memory providers in single instance

## Acceptance Criteria

- [ ] `cloud-fs-mcp multi s3://... az://...` starts successfully
- [ ] Tools route to correct provider based on path URI scheme
- [ ] VFS cache operates correctly across providers
- [ ] Existing single-provider mode is unaffected
- [ ] Unit tests verify multi-provider routing
- [ ] E2E test with two providers in one instance
