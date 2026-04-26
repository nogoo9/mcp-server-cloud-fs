// src/cache/interface.ts
import type { ParsedRoot } from "../providers/interface.js";

export interface CacheEntry {
	data: Buffer;
	expiresAt: number;
}

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
