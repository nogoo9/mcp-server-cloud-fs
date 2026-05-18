# Dynamic Tool Surface Reduction

> **Status:** ✅ Implemented in v0.7.0
> **Issue:** [#22](https://github.com/nogoo9/mcp-server-cloud-fs/issues/22)
> **Commit:** [`3f8c6cb`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/3f8c6cb) — `feat(auth): dynamic tool surface reduction based on OAuth scopes`
> **Branch:** `feat/v0.7.0-improvements`

## Problem

When an MCP client has restricted OAuth scopes (e.g., read-only), the server still registers **all** tools in `tools/list`. This wastes prompt tokens (LLMs see tool descriptions they can never use), increases the risk of tool hallucination, and violates the principle of least privilege.

## Design

### Goal

Filter the tool list at registration time so clients only see tools they're authorized to invoke. A read-only client (`cloud-fs:read`) should never see `write_file`, `delete_file`, or `shell`.

### Architecture

The existing `TOOL_SCOPE_MAP` in `src/auth/scopes.ts` already maps every tool to its required scope. The change adds a `shouldRegisterTool()` gate to `createMcpServer()`:

```typescript
// src/auth/scopes.ts — new function
export function shouldRegisterTool(
  toolName: string,
  grantedScopes?: string[],
): boolean {
  if (!grantedScopes) return true; // backwards-compatible
  return hasScope(grantedScopes, toolName);
}
```

In `src/server.ts`, each tool registration is wrapped with a scope check:

```typescript
if (shouldRegisterTool("write_file", ctx.grantedScopes)) {
  server.registerTool("write_file", ...);
}
```

### ServerContext Changes

```typescript
export interface ServerContext {
  // ... existing fields
  grantedScopes?: string[];  // NEW: if set, filters tool registration
}
```

### Scope Definitions

| Scope | Tools |
|-------|-------|
| `cloud-fs:read` | `read_file`, `read_text_file`, `read_media_file`, `read_multiple_files`, `read_file_range`, `read_file_chunk`, `get_file_info`, `list_allowed_directories`, `get_presigned_url`, `get_object_metadata`, `list_versions`, `get_file_schema`, `summarize_file` |
| `cloud-fs:write` | `write_file`, `edit_file`, `create_directory`, `move_file`, `copy_file`, `set_object_tags`, `restore_version`, `patch_file` |
| `cloud-fs:delete` | `delete_file` |
| `cloud-fs:search` | `search_files`, `grep_file`, `grep_files`, `list_directory`, `list_directory_with_sizes`, `directory_tree`, `search_by_tag` |
| `cloud-fs:shell` | `shell`, `shell_app` |
| `cloud-fs:admin` | All tools (override) |

## Implementation Plan

1. Add `shouldRegisterTool()` and `getToolsForScopes()` to `src/auth/scopes.ts`.
2. Add `grantedScopes` field to `ServerContext` in `src/server.ts`.
3. Wrap every tool registration block in `createMcpServer()` with scope checks.
4. Unit tests: verify tools are filtered based on scopes, admin overrides, backwards-compatible when no scopes set.

## Acceptance Criteria

- [x] Tools are filtered from `tools/list` when `grantedScopes` is set
- [x] `cloud-fs:admin` grants access to all tools
- [x] Missing/unknown scopes default to denying registration
- [x] No scopes configured → all tools registered (backwards-compatible)
- [x] 24 unit tests covering all scope combinations
