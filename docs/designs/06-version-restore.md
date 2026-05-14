# Object Versioning Tools (`list_versions`, `restore_version`)

## Problem

Cloud object stores with versioning maintain complete history. AI agents that write files need the ability to undo mistakes. Currently, no MCP tool exposes versioning.

## Design

### New Tools

#### 1. `list_versions`

```typescript
server.registerTool("list_versions", {
  inputSchema: z.object({
    path: z.string(),
    max_versions: z.number().int().positive().default(20),
  }),
});
```

Returns array of `{ versionId, lastModified, size, isLatest, isDeleteMarker? }`.

#### 2. `restore_version`

Copies the old version over the current one using provider-native copy-with-version.

```typescript
server.registerTool("restore_version", {
  inputSchema: z.object({
    path: z.string(),
    version_id: z.string(),
  }),
});
```

### Provider Interface Extension

Add optional `listObjectVersions?()` and `restoreObjectVersion?()` to `StorageProvider`.

- **S3**: `ListObjectVersionsCommand`, `CopyObjectCommand` with `?versionId=`
- **Azure**: blob snapshots + `beginCopyFromURL()`
- **GCS**: generation-based listing + `file.copy()` with generation
- **Memory/SQLite**: Return empty/error

### Safety

- `restore_version` requires `cloud-fs:write` scope
- VFS inode cache + content cache must be invalidated after restore
- Audit log captures version restore events

## Implementation Plan

1. Extend `StorageProvider` interface with optional versioning methods
2. Implement in S3Provider first
3. Create `src/tools/versioning.ts` with handlers
4. Register tools, add to scope map
5. VFS cache invalidation on restore
6. Unit tests with mock provider
7. Integration tests with MinIO (versioning-enabled bucket)

## Acceptance Criteria

- [ ] `list_versions` returns version history for S3 objects
- [ ] `restore_version` restores a previous version
- [ ] VFS cache properly invalidated after restore
- [ ] Non-versioned buckets return clear message
- [ ] Unsupported providers return clear error
- [ ] Unit and integration tests pass
