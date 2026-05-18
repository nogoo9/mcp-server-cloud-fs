# `patch_file` Macro Tool

> **Status:** ✅ Implemented in v0.7.0
> **Issue:** [#26](https://github.com/nogoo9/mcp-server-cloud-fs/issues/26)
> **Commit:** [`c8ee5dc`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/c8ee5dc) — `feat(tools): patch_file macro tool for unified read-diff-write operations`
> **Branch:** `feat/v0.7.0-improvements`

## Problem

To edit a file, LLMs must execute three separate tool calls: `read_text_file` → compute diff in context → `edit_file`. This is slow (3 round-trips), wastes tokens (the full file content passes through the model twice), and is error-prone (the file can change between read and write).

## Design

### Goal

A single tool call that reads a file, applies a diff, and writes the result — atomically and with optional concurrency safety.

### Tool Schema

```typescript
{
  name: "patch_file",
  inputSchema: {
    path: string,
    patch: string,
    format?: "unified" | "line_replace",  // default: "unified"
    expected_etag?: string                 // optional concurrency check
  }
}
```

### Patch Formats

**Unified diff** (default) — Standard `@@` hunk syntax:

```
@@ -2,1 +2,1 @@
-  "port": 3000
+  "port": 8080
```

Multi-hunk diffs are supported. File header lines (`---`, `+++`, `diff`, `index`) are skipped.

**Line replace** — Simpler format for line-range replacements:

```
2:2
  "port": 8080
```

Multiple replacement blocks can be specified. Applied in reverse order to preserve line indices.

### Architecture

```
src/tools/patch.ts → [NEW] parseUnifiedDiff, applyUnifiedDiff,
                           parseLineReplace, applyLineReplace,
                           handlePatchFile, registerPatchTools
src/server.ts      → [MODIFY] register patch tool
src/auth/scopes.ts → [MODIFY] map patch_file to WRITE scope
```

### Handler Flow

```typescript
async function handlePatchFile(args, ctx) {
  // 1. Read current file
  const original = await ctx.vfs.get(root, key);

  // 2. Concurrency check (optional)
  if (args.expected_etag) {
    const stat = await ctx.vfs.stat(root, key);
    if (stat.etag !== args.expected_etag) return err("Conflict: ...");
  }

  // 3. Parse and apply patch
  const result = format === "unified"
    ? applyUnifiedDiff(original, parseUnifiedDiff(args.patch))
    : applyLineReplace(original, parseLineReplace(args.patch));

  // 4. Write result
  await ctx.vfs.put(root, key, Buffer.from(result, "utf8"));

  // 5. Return summary with new ETag
  return ok(`Patched: ${oldLines} → ${newLines} lines (etag: ${newEtag})`);
}
```

### Unified Diff Parser

The parser extracts hunks by matching `@@ -old,count +new,count @@` headers, then collects lines starting with ` ` (context), `-` (removal), or `+` (addition). Application applies hunks sequentially, tracking an accumulated line offset.

### Line Replace Parser

Scans for `startLine:endLine` headers (plain integers separated by `:`), collects subsequent lines as replacement content until the next header. Applied in reverse order via `splice()`.

### Key Decisions

- **Two formats:** Unified diff is natural for LLMs trained on code. Line replace is simpler for cases where the LLM knows exact line numbers (e.g., from `read_file_range`).
- **Atomic:** The full read-transform-write happens in one handler — no intermediate state exposure.
- **ETag integration:** Leverages the v0.7.0 ETag system for concurrency safety without reimplementing conflict detection.

## Implementation Plan

1. Implement `parseUnifiedDiff()` and `applyUnifiedDiff()`.
2. Implement `parseLineReplace()` and `applyLineReplace()`.
3. Create `handlePatchFile` with concurrency check and format dispatch.
4. Register tool in `createMcpServer()`.
5. Map to `cloud-fs:write` scope.
6. Unit tests: `src/tools/patch.test.ts` — 20 tests covering both formats, multi-hunk, edge cases, ETag conflicts.

## Acceptance Criteria

- [x] Unified diff format parses `@@` hunks correctly
- [x] Multi-hunk diffs apply with correct offset tracking
- [x] File header lines (`---`, `+++`) are skipped
- [x] Line replace format parses `startLine:endLine` blocks
- [x] Multiple replacement blocks apply in correct order
- [x] `expected_etag` mismatch returns conflict error
- [x] Response includes new ETag and line count summary
- [x] Mapped to `cloud-fs:write` scope
- [x] 20 unit tests passing
