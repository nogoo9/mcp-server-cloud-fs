# Programmatic API

`@nogoo9/mcp-server-cloud-fs` is available as an npm library for embedding in your own applications.

## Installation

```bash
npm install @nogoo9/mcp-server-cloud-fs
# or
bun add @nogoo9/mcp-server-cloud-fs
```

## Quick Example

```ts
import {
  createMcpServer, VirtualFS, MemoryStore,
  S3Provider, parseUri,
} from "@nogoo9/mcp-server-cloud-fs";

const roots    = [parseUri("s3://my-bucket")];
const provider = new S3Provider({ region: "us-east-1" });
const cache    = new MemoryStore(provider, { ttlMs: 60_000, syncDebounceMs: 2000 });
const vfs      = new VirtualFS(provider, cache);
await vfs.hydrate();

const server = createMcpServer({ vfs, roots });
```

## Exported API

| Export | Description |
|---|---|
| `createMcpServer(ctx)` | Create a configured MCP server instance |
| `executeShell(command, ctx)` | Run POSIX-like commands against the VFS |
| `VirtualFS` | FUSE-inspired write-back overlay |
| `MemoryStore`, `FilesystemStore`, `createRedisStore`, `PassThroughCache` | Cache backends |
| `S3Provider`, `AzureProvider`, `GcsProvider`, `MemoryProvider`, `SqliteProvider` | Storage providers |
| `parseUri`, `toCacheKey`, `resolveToolPath` | Path utilities |
| `ShellContext`, `ShellCommandHandler` | Shell extension types |
| `createTransport`, `isBun` | Transport factory + runtime detection |
| `WebSocketServerTransport` | Bun-native WebSocket transport |
| `inferContentType` | MIME type inference from file extension |
| `ServerContext`, `VfsStat`, `CacheStore`, `Scope` | Core types |

## Custom Provider Example

```ts
import {
  VirtualFS, MemoryStore, MemoryProvider, createMcpServer, parseUri,
} from "@nogoo9/mcp-server-cloud-fs";

// In-memory provider for testing
const provider = new MemoryProvider();
const cache = new MemoryStore(provider, { ttlMs: 30_000, syncDebounceMs: 1000 });
const vfs = new VirtualFS(provider, cache);
await vfs.hydrate();

const server = createMcpServer({
  vfs,
  roots: [parseUri("mem://test")],
  enableShell: true,
  enableDelete: false,
});

// Use with any MCP transport
```

## Shell Integration

```ts
import { executeShell, VirtualFS, MemoryStore, MemoryProvider } from "@nogoo9/mcp-server-cloud-fs";

// ... setup provider, cache, vfs ...

const result = await executeShell('ls -l mem://test/', {
  vfs,
  roots: [parseUri("mem://test")],
  enableDelete: false,
});

console.log(result); // directory listing output
```
