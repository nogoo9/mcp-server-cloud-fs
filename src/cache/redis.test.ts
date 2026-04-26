// src/cache/redis.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import { RedisStore } from "./redis.js";

const mockRoot: ParsedRoot = {
	scheme: "s3",
	bucket: "test-bucket",
	prefix: "",
	uri: "s3://test-bucket",
};
const KEY_A = "s3://test-bucket/a.txt";

function makeProvider(): StorageProvider {
	return {
		getObject: mock(async () => Buffer.from("remote")),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async () => ({
			key: "a.txt",
			size: 6,
			lastModified: new Date(),
		})),
		listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		createPrefix: mock(async () => {}),
	};
}

function makeRedisClient(storedValue: Buffer | null = null) {
	const store = new Map<string, Buffer>();
	if (storedValue) store.set(KEY_A, storedValue);
	return {
		getBuffer: mock(async (key: string) => store.get(key) ?? null),
		setex: mock(async (key: string, _ttl: number, value: Buffer) => {
			store.set(key, value);
		}),
		del: mock(async (key: string) => {
			store.delete(key);
		}),
	};
}

describe("RedisStore.get / set", () => {
	it("returns null on miss", async () => {
		const store = new RedisStore(makeProvider(), makeRedisClient(), {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		expect(await store.get(KEY_A)).toBeNull();
	});

	it("returns cached value on hit", async () => {
		const store = new RedisStore(
			makeProvider(),
			makeRedisClient(Buffer.from("cached")),
			{ ttlMs: 60_000, syncDebounceMs: 100 },
		);
		expect((await store.get(KEY_A))?.toString()).toBe("cached");
	});

	it("calls setex with correct TTL seconds", async () => {
		const client = makeRedisClient();
		const store = new RedisStore(makeProvider(), client, {
			ttlMs: 30_000,
			syncDebounceMs: 100,
		});
		await store.set(KEY_A, Buffer.from("data"));
		expect(client.setex).toHaveBeenCalledWith(KEY_A, 30, Buffer.from("data"));
	});

	it("rounds TTL up to nearest second", async () => {
		const client = makeRedisClient();
		const store = new RedisStore(makeProvider(), client, {
			ttlMs: 1_500,
			syncDebounceMs: 100,
		});
		await store.set(KEY_A, Buffer.from("data"));
		expect(client.setex).toHaveBeenCalledWith(KEY_A, 2, Buffer.from("data"));
	});
});

describe("RedisStore.flush", () => {
	it("flushes dirty entries to provider", async () => {
		const provider = makeProvider();
		const client = makeRedisClient(Buffer.from("content"));
		const store = new RedisStore(provider, client, {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await store.flush();
		expect(provider.putObject).toHaveBeenCalledWith(
			mockRoot,
			"a.txt",
			Buffer.from("content"),
		);
		expect(store.isDirty(KEY_A)).toBe(false);
	});
});

describe("RedisStore.delete", () => {
	it("calls del and clears dirty flag", async () => {
		const client = makeRedisClient();
		const store = new RedisStore(makeProvider(), client, {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await store.delete(KEY_A);
		expect(client.del).toHaveBeenCalledWith(KEY_A);
		expect(store.isDirty(KEY_A)).toBe(false);
	});
});
