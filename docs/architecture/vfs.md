# Virtual Filesystem (VFS)

All tool operations are mediated through a **Virtual Filesystem (VFS)** layer inspired by [FUSE](https://en.wikipedia.org/wiki/Filesystem_in_Userspace).

## Architecture Overview

<!-- @image-prompt architecture-overview.png: A clean technical architecture diagram on a dark background (navy blue #1a1a2e). Show a layered system architecture with color-coded boxes connected by arrows flowing top to bottom: Layer 1 (top, teal): Two boxes side by side: "MCP Client" and "cloud-fs TUI". Layer 2 (blue): Three boxes side by side: "STDIO", "HTTP", "WebSocket" — labeled "Transport Layer". Layer 3 (indigo): "MCP Server" box. Layer 4 (purple): Two small boxes side by side: "Auth Middleware", "Rate Limiter". Layer 5 (violet): "Tool Handlers" box with small labels: read, write, edit, search, shell. Layer 6 (magenta): "Virtual Filesystem (VFS)" box — highlighted as the core, with a subtle glow. Layer 7 (split into two columns): LEFT column (pink): "Cache Store" box with arrows pointing down to two small boxes: "Redis", "In-Memory". RIGHT column (pink): "Storage Provider" box with arrows pointing down to five small boxes: "S3", "Azure", "GCS", "SQLite", "In-Memory". Clean arrows between layers. Modern flat design, no 3D effects. White text on colored boxes. Subtle grid background. -->
![System architecture showing the full stack from MCP Client to Storage Providers](/images/architecture-overview.png)

The VFS sits between the tool handlers and the underlying cache/provider layers, providing immediate write visibility and FUSE-like cache coherence.

<!-- @image-prompt vfs-internals.png: A technical architecture diagram on a dark navy background (#1a1a2e) showing the internal structure of a Virtual Filesystem (VFS) layer. Top section (full width, violet): "MCP Tool Handlers (read, write, list, stat, ...)". Middle section (full width, magenta with glow): "VirtualFS" containing three smaller boxes side by side: "Inodes (metadata)" in teal, "DirIndex (parents)" in blue, "Tombstones (deleted)" in purple. Below these three boxes, a label: "Overlay (in-memory, persisted to CacheStore)". Bottom section split into two: LEFT (pink): "CacheStore" with three small boxes beneath: "Memory", "Filesystem", "Redis". RIGHT (orange): "StorageProvider" with five small boxes beneath: "S3", "Azure Blob", "GCS", "Memory", "SQLite". Clean arrows flowing down between sections. Modern flat design, white text on colored boxes. Subtle grid background. The VFS box should have a subtle glow effect. -->
![VFS internal architecture showing Inodes, DirIndex, Tombstones, CacheStore, and StorageProvider](/images/vfs-internals.png)

## Read/Write Flow

<!-- @image-prompt vfs-flow.png: A technical flowchart diagram on a dark navy background showing two parallel swim lanes for a Virtual Filesystem (VFS). LEFT LANE - "Read Path" (teal/cyan colored): "read_file(path)" → Decision: "In Inode Table?" → Yes → "Return cached content". No → Decision: "In Tombstone Set?" → Yes → "Return 404". No → "Check Cache Store" → Hit → "Return cached". Miss → "Fetch from Provider" → "Store in Cache" → "Return content". RIGHT LANE - "Write Path" (magenta/pink colored): "write_file(path, data)" → "Create/Update Inode" → "Update DirIndex" → "Mark Dirty" → "Start Debounce Timer" → "Flush to Provider". Clean flat design, white text, rounded boxes, colored arrows showing flow direction. Decision diamonds. -->
![VFS read and write path flowchart](/images/vfs-flow.png)

### Operation Resolution

| Operation | Resolution |
|---|---|
| **`get()`** | Cache hit → return. Tombstoned → throw. Else → provider fallback. |
| **`stat()`** | Inode overlay → cached content size → provider `headObject`. |
| **`list()`** | Provider listing – tombstones + overlay dirIndex entries. |
| **`put()`** | Cache set + markDirty + inode update + dirIndex. Immediate visibility. |
| **`remove()`** | Provider deleteObject + cache evict + tombstone. Immediate invisibility. |

## Key Components

### Inodes

The inode table is an in-memory map of file metadata (size, timestamps, content hash). When a file is written, the inode is immediately updated — subsequent `stat()` calls reflect the new state without waiting for the provider flush.

### DirIndex

The directory index tracks parent-child relationships. When a file is written to `s3://bucket/a/b/c.txt`, the dirIndex records:
- `a/` contains `b/`
- `a/b/` contains `c.txt`

This allows `list_directory` to return newly created files immediately, even before they're flushed to the provider.

### Tombstones

When a file is deleted, a tombstone marker prevents it from reappearing via provider listing or cache reads. Tombstones are cleared once the delete propagates to the provider.

### ETags

Every `put()` operation computes a SHA-256 hash of the content and stores it as an ETag in the inode overlay. ETags enable **optimistic concurrency control** for multi-agent workflows:

- `stat()` returns the ETag for any file with a cached inode
- `read_text_file` includes the ETag in response metadata (`[etag: <hash>]`)
- `edit_file` and `patch_file` accept an optional `expected_etag` parameter:
  - **Matching ETag** → operation proceeds normally
  - **Mismatching ETag** → conflict error with the current ETag returned
  - **Omitted** → backwards-compatible, no check performed

This allows multiple agents to safely coordinate writes without locking:

```
Agent A: read_text_file → gets content + etag "abc123"
Agent B: read_text_file → gets content + etag "abc123"
Agent A: edit_file(expected_etag="abc123") → succeeds, new etag "def456"
Agent B: edit_file(expected_etag="abc123") → CONFLICT! etag is now "def456"
Agent B: re-reads file, resolves conflict, retries
```

## Persistence

VFS metadata is persisted to the CacheStore under `__vfs__/*` keys. On startup, `VirtualFS.hydrate()` restores state; corrupted data is silently discarded. This allows the VFS to survive process restarts when using a persistent cache backend (filesystem or Redis).

## Write-Back Flushing

Dirty entries are flushed to the provider after a configurable debounce window (default: 2000ms). The `vfs.flush()` method is called on graceful shutdown to ensure no data is lost.
