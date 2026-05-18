# ETag Optimistic Concurrency Control

> **Status:** ✅ Implemented in v0.7.0
> **Issue:** [#25](https://github.com/nogoo9/mcp-server-cloud-fs/issues/25)
> **Commit:** [`57041d7`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/57041d7) — `feat(vfs): optimistic concurrency control via ETags`
> **Branch:** `feat/v0.7.0-improvements`

## Problem

When multiple AI agents or users work on the same file concurrently, writes silently overwrite each other. There is no mechanism to detect conflicts — the last writer always wins. This is particularly dangerous in multi-agent workflows where agents may read a file, compute changes, and write back without knowing the file was modified in between.

## Design

### Goal

Add content-addressable ETags to the VFS layer so tools can detect and reject stale writes.

### ETag Generation

On every `put()` call, compute a SHA-256 hash of the content and store it in the inode:

```typescript
// src/vfs.ts — inside put()
import { createHash } from "node:crypto";

const etag = createHash("sha256").update(buffer).digest("hex");
this.inodes.set(cacheKey, {
  size: buffer.length,
  mtime: now,
  etag,
});
```

### VfsStat Changes

```typescript
export interface VfsStat {
  size: number;
  mtime: Date;
  contentType?: string;
  etag?: string;  // NEW
}
```

The `etag` field is persisted in the inode overlay and survives VFS hydration from CacheStore.

### Tool Integration

**`read_text_file`** — Appends ETag metadata to responses:

```
File content here...

[etag: a1b2c3d4e5...]
```

**`edit_file`** — Accepts optional `expected_etag` parameter:

```typescript
{
  path: "s3://bucket/file.txt",
  edits: [...],
  expected_etag: "a1b2c3d4e5..."  // optional
}
```

- Match → edit proceeds
- Mismatch → `Conflict: file has been modified since last read`
- Omitted → no check (backwards-compatible)

### Multi-Agent Flow

```
Agent A: read_text_file → content + etag "abc"
Agent B: read_text_file → content + etag "abc"
Agent A: edit_file(expected_etag="abc") → success, new etag "def"
Agent B: edit_file(expected_etag="abc") → CONFLICT (current is "def")
Agent B: re-read, resolve, retry with expected_etag="def"
```

### Key Decisions

- **SHA-256 over MD5:** Stronger collision resistance, negligible performance difference for typical file sizes.
- **Hex encoding:** More readable in tool responses than base64.
- **Inode-level storage:** ETags are computed and cached at the VFS layer, not the provider layer. This ensures consistency across all backends.
- **No new dependencies:** Uses `node:crypto` built-in.

## Implementation Plan

1. Add `etag` field to `VfsStat` and inode serialization/deserialization.
2. Compute SHA-256 ETag in `VirtualFS.put()`.
3. Modify `handleReadTextFile` to append ETag metadata.
4. Add `expected_etag` parameter to `edit_file` tool schema.
5. Implement conflict detection in `handleEditFile`.
6. Update E2E tests (assertions changed from exact match to `toContain`).
7. Unit tests: `src/tools/etag.test.ts` — 7 tests.

## Acceptance Criteria

- [x] Every `put()` computes and stores a SHA-256 ETag
- [x] `stat()` returns ETag for files with cached inodes
- [x] `read_text_file` includes ETag in response metadata
- [x] `edit_file` with matching `expected_etag` succeeds
- [x] `edit_file` with mismatching `expected_etag` returns conflict error
- [x] `edit_file` without `expected_etag` is backwards-compatible
- [x] ETags survive VFS serialization/deserialization
- [x] 7 unit tests passing
