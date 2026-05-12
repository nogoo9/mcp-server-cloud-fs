// src/lib.ts
// Public API — use this as the programmatic entry point for the library.

export type { Scope } from "./auth/scopes.js";
// Auth (v0.4.0)
export {
	ALL_SCOPES,
	getRequiredScope,
	hasScope,
	parseScopes,
	SCOPES,
} from "./auth/scopes.js";
export type {
	EnterpriseAuthOptions,
	TokenClaims,
	VerifierOptions,
} from "./auth/verifier.js";
export {
	EnterpriseAuthVerifier,
	ExternalTokenVerifier,
	extractBearerToken,
} from "./auth/verifier.js";
export { FilesystemStore } from "./cache/filesystem.js";
// Cache backends
export type { CacheStore } from "./cache/interface.js";
export { MemoryStore } from "./cache/memory.js";
export { PassThroughCache } from "./cache/passthrough.js";
export { createRedisStore } from "./cache/redis.js";
export type { RateLimiter, RateLimitResult } from "./middleware/rate-limit.js";
// Middleware (v0.4.0)
export {
	createRateLimiter,
	InMemoryRateLimiter,
} from "./middleware/rate-limit.js";
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
export type {
	ManagedTransport,
	TransportOptions,
	TransportType,
} from "./transports/index.js";
// Transports (v0.4.0)
export { createTransport, isBun } from "./transports/index.js";
export { WebSocketServerTransport } from "./transports/ws.js";
// VFS
export type { VfsStat } from "./vfs.js";
export { VirtualFS } from "./vfs.js";
