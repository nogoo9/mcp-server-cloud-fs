// src/lib.ts
// Public API — use this as the programmatic entry point for the library.

export { FilesystemStore } from "./cache/filesystem.js";
// Cache backends
export type { CacheStore } from "./cache/interface.js";
export { MemoryStore } from "./cache/memory.js";
export { PassThroughCache } from "./cache/passthrough.js";
export { createRedisStore } from "./cache/redis.js";
// Utilities
export { parseUri, resolveToolPath, toCacheKey } from "./path-utils.js";
export { AzureProvider } from "./providers/azure.js";
export { GcsProvider } from "./providers/gcs.js";
// Storage providers
export type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./providers/interface.js";
export { S3Provider } from "./providers/s3.js";
export type { ServerContext } from "./server.js";
export { createMcpServer } from "./server.js";
export type { VfsStat } from "./vfs.js";
export { VirtualFS } from "./vfs.js";
