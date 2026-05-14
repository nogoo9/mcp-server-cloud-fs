# Object Metadata & Tag Search Tools

## Problem

Cloud objects are more than just bytes — they carry **metadata** (Content-Type, Cache-Control, custom headers) and **tags** (key-value pairs for classification, cost allocation, lifecycle management). The current toolset treats objects as opaque files, missing these cloud-native capabilities.

Use cases:
- "Find all objects tagged `environment=production`"
- "Show me the metadata for this config file"
- "Tag all CSV files under `data/` with `department=analytics`"

## Design

### New Tools

#### 1. `get_object_metadata`

```typescript
server.registerTool("get_object_metadata", {
  description: "Get cloud-native metadata and tags for an object (content-type, custom headers, S3 tags, etc.).",
  inputSchema: z.object({
    path: z.string(),
  }),
});
```

Returns:
```json
{
  "key": "data/report.csv",
  "size": 45231,
  "lastModified": "2024-01-15T10:00:00Z",
  "contentType": "text/csv",
  "metadata": { "x-amz-meta-author": "alice", "x-amz-meta-version": "3" },
  "tags": { "department": "analytics", "environment": "production" }
}
```

#### 2. `set_object_tags`

```typescript
server.registerTool("set_object_tags", {
  description: "Set or update tags on a cloud object. Replaces all existing tags.",
  inputSchema: z.object({
    path: z.string(),
    tags: z.record(z.string(), z.string()).describe("Key-value tag pairs"),
  }),
});
```

#### 3. `search_by_tag`

```typescript
server.registerTool("search_by_tag", {
  description: "Find objects matching tag filters under a path.",
  inputSchema: z.object({
    path: z.string(),
    tags: z.record(z.string(), z.string()).describe("Tag key-value pairs to match (AND logic)"),
    max_objects: z.number().int().positive().default(100),
  }),
});
```

### Provider Interface Extension

```typescript
export interface StorageProvider {
  // ... existing methods ...

  /** Get object metadata and tags. */
  getObjectMetadata?(root: ParsedRoot, key: string): Promise<ObjectMetadata>;

  /** Set tags on an object. */
  setObjectTags?(root: ParsedRoot, key: string, tags: Record<string, string>): Promise<void>;

  /** Get tags for an object. */
  getObjectTags?(root: ParsedRoot, key: string): Promise<Record<string, string>>;
}

export interface ObjectMetadata extends ObjectInfo {
  metadata: Record<string, string>;  // custom metadata headers
  tags: Record<string, string>;      // object tags
}
```

### Provider Support

| Provider | Metadata | Tags |
|---|---|---|
| S3 | ✅ `HeadObject` → `Metadata` | ✅ `GetObjectTagging` / `PutObjectTagging` |
| Azure | ✅ `getProperties()` → `metadata` | ✅ `getTags()` / `setTags()` |
| GCS | ✅ `file.metadata` | ✅ Via `metadata.labels` (GCS uses labels not tags) |
| Memory | ✅ In-memory map | ✅ In-memory map |
| SQLite | ✅ JSON column | ✅ JSON column |

### Search Strategy

`search_by_tag` lists objects under the prefix, then fetches tags for each and filters client-side. This is O(n) in objects but necessary since most cloud providers don't support server-side tag-based listing (except S3 Inventory, which is async).

Cap at `max_objects` to bound the cost.

## Implementation Plan

1. Extend `StorageProvider` interface with optional `getObjectMetadata`, `setObjectTags`, `getObjectTags`.
2. Implement in S3Provider (HeadObject + GetObjectTagging/PutObjectTagging).
3. Implement in MemoryProvider (in-memory maps).
4. Create `src/tools/metadata.ts` with handlers.
5. Register tools, add to scope map (`get_object_metadata` → READ, `set_object_tags` → WRITE, `search_by_tag` → SEARCH).
6. Unit tests with mock provider.
7. Integration tests with MinIO.

## Acceptance Criteria

- [ ] `get_object_metadata` returns metadata + tags for S3/Azure/GCS objects
- [ ] `set_object_tags` sets tags on objects
- [ ] `search_by_tag` finds objects matching tag filters
- [ ] Unsupported providers return clear error messages
- [ ] Memory/SQLite providers support metadata and tags
- [ ] Proper OAuth scope enforcement
- [ ] Unit tests with mock provider
