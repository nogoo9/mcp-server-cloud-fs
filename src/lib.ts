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
export { inferContentType } from "./providers/content-type.js";
export { GcsProvider } from "./providers/gcs.js";
// Storage providers
export type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./providers/interface.js";
export { MemoryProvider } from "./providers/memory.js";
export { S3Provider } from "./providers/s3.js";
export { SqliteProvider } from "./providers/sqlite.js";
export type { ServerContext } from "./server.js";
export { createMcpServer } from "./server.js";
export { executeShell } from "./tools/shell/index.js";
export type { ShellCommandHandler, ShellContext } from "./tools/shell/types.js";
// Transports (v0.4.0)
export { createTransport, isBun } from "./transports/index.js";
export type {
	ManagedTransport,
	TransportOptions,
	TransportType,
} from "./transports/index.js";
export { WebSocketServerTransport } from "./transports/ws.js";
// Auth (v0.4.0)
export {
	SCOPES,
	ALL_SCOPES,
	getRequiredScope,
	hasScope,
	parseScopes,
} from "./auth/scopes.js";
export type { Scope } from "./auth/scopes.js";
export {
	ExternalTokenVerifier,
	EnterpriseAuthVerifier,
	extractBearerToken,
} from "./auth/verifier.js";
export type { TokenClaims, VerifierOptions, EnterpriseAuthOptions } from "./auth/verifier.js";
// Middleware (v0.4.0)
export { createRateLimiter, InMemoryRateLimiter } from "./middleware/rate-limit.js";
export type { RateLimiter, RateLimitResult } from "./middleware/rate-limit.js";
// VFS
export type { VfsStat } from "./vfs.js";
export { VirtualFS } from "./vfs.js";
