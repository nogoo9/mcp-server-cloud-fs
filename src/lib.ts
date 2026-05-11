// src/lib.ts
// Public API — use this as the programmatic entry point for the library.

export { createMcpServer } from "./server.js";
export type { ServerContext } from "./server.js";

export { VirtualFS } from "./vfs.js";
export type { VfsStat } from "./vfs.js";

// Cache backends
export type { CacheStore } from "./cache/interface.js";
export { MemoryStore } from "./cache/memory.js";
export { PassThroughCache } from "./cache/passthrough.js";
export { FilesystemStore } from "./cache/filesystem.js";
export { createRedisStore } from "./cache/redis.js";

// Storage providers
export type {
	StorageProvider,
	ParsedRoot,
	ObjectInfo,
	ListResult,
} from "./providers/interface.js";
export { S3Provider } from "./providers/s3.js";
export { AzureProvider } from "./providers/azure.js";
export { GcsProvider } from "./providers/gcs.js";

// Utilities
export { parseUri, toCacheKey, resolveToolPath } from "./path-utils.js";
