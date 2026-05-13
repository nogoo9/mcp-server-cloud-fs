// src/cache/memory.ts

import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import type { CacheStore } from "./interface.js";

interface Entry {
	data: Buffer;
	expiresAt: number;
}

interface DirtyMeta {
	root: ParsedRoot;
	key: string;
}

/**
 * In-memory cache store with TTL expiry and debounced write-back.
 *
 * All data is held in a `Map` and lost on process exit. Suitable for
 * development, testing, and single-process deployments.
 *
 * @category Cache
 */
export class MemoryStore implements CacheStore {
	private readonly entries = new Map<string, Entry>();
	private readonly dirtyMap = new Map<string, DirtyMeta>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly provider: StorageProvider,
		private readonly opts: { ttlMs: number; syncDebounceMs: number },
	) {}

	async get(cacheKey: string): Promise<Buffer | null> {
		const entry = this.entries.get(cacheKey);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.entries.delete(cacheKey);
			return null;
		}
		return entry.data;
	}

	async set(cacheKey: string, value: Buffer): Promise<void> {
		this.entries.set(cacheKey, {
			data: value,
			expiresAt: Date.now() + this.opts.ttlMs,
		});
	}

	markDirty(cacheKey: string, root: ParsedRoot, key: string): void {
		this.dirtyMap.set(cacheKey, { root, key });
		this.scheduleFlush();
	}

	isDirty(cacheKey: string): boolean {
		return this.dirtyMap.has(cacheKey);
	}

	dirtyEntries(): string[] {
		return [...this.dirtyMap.keys()];
	}

	async delete(cacheKey: string): Promise<void> {
		this.entries.delete(cacheKey);
		this.dirtyMap.delete(cacheKey);
	}

	async clear(): Promise<void> {
		this.entries.clear();
		this.dirtyMap.clear();
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	async flush(): Promise<void> {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		await this.doFlush();
	}

	/** Cancels the debounce timer without flushing. Call in tests to avoid timer leaks. */
	dispose(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	private scheduleFlush(): void {
		if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.doFlush();
		}, this.opts.syncDebounceMs);
	}

	private async doFlush(): Promise<void> {
		const entries = [...this.dirtyMap.entries()];
		this.dirtyMap.clear();
		await Promise.all(
			entries.map(async ([cacheKey, { root, key }]) => {
				const buffer = await this.get(cacheKey);
				if (buffer !== null) {
					await this.provider.putObject(root, key, buffer);
				}
			}),
		);
	}
}
