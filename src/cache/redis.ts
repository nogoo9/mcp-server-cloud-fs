// src/cache/redis.ts

import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import type { CacheStore } from "./interface.js";

interface DirtyMeta {
	root: ParsedRoot;
	key: string;
}

interface RedisClient {
	getBuffer(key: string): Promise<Buffer | null>;
	setex(key: string, ttlSeconds: number, value: Buffer): Promise<unknown>;
	del(key: string): Promise<unknown>;
}

export class RedisStore implements CacheStore {
	private readonly dirtyMap = new Map<string, DirtyMeta>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly provider: StorageProvider,
		private readonly client: RedisClient,
		private readonly opts: { ttlMs: number; syncDebounceMs: number },
	) {}

	async get(cacheKey: string): Promise<Buffer | null> {
		return this.client.getBuffer(cacheKey);
	}

	async set(cacheKey: string, value: Buffer): Promise<void> {
		const ttlSeconds = Math.ceil(this.opts.ttlMs / 1000);
		await this.client.setex(cacheKey, ttlSeconds, value);
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
		this.dirtyMap.delete(cacheKey);
		await this.client.del(cacheKey);
	}

	async clear(): Promise<void> {
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

/**
 * Loads ioredis at runtime (optional peer dep) and returns a RedisStore.
 * Exits with code 1 and install instructions if ioredis is not installed.
 *
 * @param caPem - Custom CA certificate (PEM) for TLS verification. Only used
 *   when `redisUrl` starts with `rediss://` and a private/self-signed CA is
 *   in use. For public CAs, `rediss://` alone is sufficient.
 */
export async function createRedisStore(
	provider: StorageProvider,
	redisUrl: string,
	opts: { ttlMs: number; syncDebounceMs: number },
	caPem?: Buffer,
): Promise<RedisStore> {
	let ioredis: {
		default: new (
			url: string,
			options?: Record<string, unknown>,
		) => RedisClient;
	};
	try {
		ioredis = await import("ioredis");
	} catch {
		console.error(
			"Error: --cache-store redis requires ioredis.\n" +
				"Install it: bun add ioredis",
		);
		process.exit(1);
	}
	const tlsOptions =
		caPem && redisUrl.startsWith("rediss://") ? { tls: { ca: caPem } } : {};
	const client = new ioredis.default(redisUrl, tlsOptions);
	return new RedisStore(provider, client, opts);
}
