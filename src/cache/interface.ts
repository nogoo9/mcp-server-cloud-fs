// src/cache/interface.ts
import type { ParsedRoot } from "../providers/interface.js";

/** A cached object with its data and TTL expiry timestamp. */
export interface CacheEntry {
	data: Buffer;
	expiresAt: number;
}

/**
 * Cache backend interface for the VFS write-back overlay.
 *
 * Implementations must handle dirty tracking, debounced flushing, and TTL-based expiry.
 * Built-in implementations: {@link MemoryStore}, {@link FilesystemStore}, {@link PassThroughCache},
 * and the Redis-backed store created via {@link createRedisStore}.
 *
 * @category Cache
 */
export interface CacheStore {
	/** Returns null on cache miss or TTL expiry. Does NOT call the provider. */
	get(cacheKey: string): Promise<Buffer | null>;
	/** Stores value with TTL; does NOT mark dirty. */
	set(cacheKey: string, value: Buffer): Promise<void>;
	/** Marks cacheKey dirty and records routing info for flush. Starts debounce timer. */
	markDirty(cacheKey: string, root: ParsedRoot, key: string): void;
	isDirty(cacheKey: string): boolean;
	dirtyEntries(): string[];
	delete(cacheKey: string): Promise<void>;
	clear(): Promise<void>;
	/** Cancels debounce timer; flushes all dirty entries to provider synchronously. */
	flush(): Promise<void>;
}
