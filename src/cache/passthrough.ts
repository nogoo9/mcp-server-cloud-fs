// src/cache/passthrough.ts

import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import type { CacheStore } from "./interface.js";

/**
 * No-op cache that writes through immediately to the provider.
 *
 * Every `markDirty` call triggers an immediate `putObject` — there is
 * no buffering, TTL, or debouncing. Useful when caching is unwanted
 * but the VFS still expects a {@link CacheStore} implementation.
 *
 * @category Cache
 */
export class PassThroughCache implements CacheStore {
	private readonly pending = new Map<string, Buffer>();

	constructor(private readonly provider: StorageProvider) {}

	async get(_cacheKey: string): Promise<Buffer | null> {
		return null;
	}

	async set(cacheKey: string, value: Buffer): Promise<void> {
		this.pending.set(cacheKey, value);
	}

	markDirty(cacheKey: string, root: ParsedRoot, key: string): void {
		const buffer = this.pending.get(cacheKey);
		this.pending.delete(cacheKey);
		if (buffer !== undefined) {
			void this.provider.putObject(root, key, buffer);
		}
	}

	isDirty(_cacheKey: string): boolean {
		return false;
	}
	dirtyEntries(): string[] {
		return [];
	}
	async delete(cacheKey: string): Promise<void> {
		this.pending.delete(cacheKey);
	}
	async clear(): Promise<void> {
		this.pending.clear();
	}
	async flush(): Promise<void> {}
}
