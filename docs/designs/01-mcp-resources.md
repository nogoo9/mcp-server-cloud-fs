# Expose Bucket Hierarchies as MCP Resources

## Problem

Currently, all interactions with cloud storage go through MCP **Tools** (e.g., `list_directory`, `read_file`). This forces the LLM to explicitly call `list_directory` before it can "see" the file structure, consuming extra tokens and round-trips. The MCP specification includes a **Resources** primitive designed for exactly this — exposing data the LLM can browse in its context window without explicit tool calls.

## Design

### Resource URI Scheme

Map each configured root + its directory structure to MCP Resources:

```
cloud-fs://{scheme}://{bucket}/{prefix}
```

Examples:
- `cloud-fs://s3://my-bucket/` → lists top-level objects/prefixes
- `cloud-fs://s3://my-bucket/data/` → lists objects under `data/`
- `cloud-fs://s3://my-bucket/config.json` → returns file content

### Resource Templates

Register a parameterized **resource template** per configured root:

```typescript
server.registerResourceTemplate(
  "cloud-fs-browse",
  {
    uriTemplate: "cloud-fs://{rootUri}/{path*}",
    name: "Cloud Storage Browser",
    description: "Browse files and directories in configured cloud storage roots.",
    mimeType: "text/plain",
  },
  async ({ rootUri, path }) => { /* resolve via VFS */ }
);
```

### Static Root Resources

On startup, register a **static resource** for each configured root URI:

```typescript
for (const root of ctx.roots) {
  server.registerResource(
    `root:${root.uri}`,
    `cloud-fs://${root.uri}/`,
    { name: `Root: ${root.uri}`, description: `Top-level listing of ${root.uri}` },
    async () => { /* VFS list with delimiter "/" */ }
  );
}
```

### Response Format

- **Directory resources**: Return a structured listing (JSON or formatted text) of objects and sub-prefixes.
- **File resources**: Return UTF-8 text content (or base64 for binary, with `mimeType` set).
- **Metadata**: Include `size`, `lastModified`, `contentType` in resource metadata when available.

### Architecture Impact

```
src/server.ts       → new registerResources(server, ctx) call
src/resources/      → [NEW] resource handler module
  index.ts          → registration logic
```

No changes to VFS, providers, or existing tools. Resources are a read-only view.

## Implementation Plan

1. Create `src/resources/index.ts` with `registerResources(server, ctx)`.
2. Register static root resources for each `ctx.roots` entry.
3. Register a resource template that resolves `{path}` to either a directory listing or file content via `ctx.vfs`.
4. Add `registerResources()` call in `createMcpServer()` in `src/server.ts`.
5. Unit tests: `src/resources/index.test.ts` — mock VFS, verify resource resolution.
6. E2E test: extend `http.e2e.test.ts` to verify resource listing over transport.

## Acceptance Criteria

- [ ] MCP clients can discover root resources without calling any tool
- [ ] Navigating a resource URI returns directory listing or file content
- [ ] Resource template handles nested paths (`a/b/c/`)
- [ ] Binary files return base64 with correct `mimeType`
- [ ] Unit tests pass with mock provider
