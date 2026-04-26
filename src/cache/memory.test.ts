// src/cache/memory.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import { MemoryStore } from "./memory.js";

const mockRoot: ParsedRoot = {
	scheme: "s3",
	bucket: "test-bucket",
	prefix: "",
	uri: "s3://test-bucket",
};
const KEY_A = "s3://test-bucket/a.txt";
const KEY_B = "s3://test-bucket/b.txt";

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

describe("MemoryStore.get / set", () => {
	it("returns null on miss", async () => {
		const store = new MemoryStore(makeProvider(), {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		expect(await store.get(KEY_A)).toBeNull();
	});

	it("returns cached value on hit", async () => {
		const store = new MemoryStore(makeProvider(), {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		await store.set(KEY_A, Buffer.from("hello"));
		expect((await store.get(KEY_A))?.toString()).toBe("hello");
	});

	it("returns null after TTL expires", async () => {
		const store = new MemoryStore(makeProvider(), {
			ttlMs: 20,
			syncDebounceMs: 100,
		});
		await store.set(KEY_A, Buffer.from("hi"));
		await Bun.sleep(30);
		expect(await store.get(KEY_A)).toBeNull();
	});
});

describe("MemoryStore.markDirty / isDirty / dirtyEntries", () => {
	it("tracks dirty state", async () => {
		const store = new MemoryStore(makeProvider(), {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		expect(store.isDirty(KEY_A)).toBe(false);
		store.markDirty(KEY_A, mockRoot, "a.txt");
		expect(store.isDirty(KEY_A)).toBe(true);
		expect(store.dirtyEntries()).toEqual([KEY_A]);
		store.dispose();
	});
});

describe("MemoryStore.flush", () => {
	it("flushes dirty entries to provider immediately", async () => {
		const provider = makeProvider();
		const store = new MemoryStore(provider, {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("updated"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await store.flush();
		expect(provider.putObject).toHaveBeenCalledTimes(1);
		expect(provider.putObject).toHaveBeenCalledWith(
			mockRoot,
			"a.txt",
			Buffer.from("updated"),
		);
		expect(store.isDirty(KEY_A)).toBe(false);
	});

	it("flushes multiple dirty entries", async () => {
		const provider = makeProvider();
		const store = new MemoryStore(provider, {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("a"));
		await store.set(KEY_B, Buffer.from("b"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		store.markDirty(KEY_B, mockRoot, "b.txt");
		await store.flush();
		expect(provider.putObject).toHaveBeenCalledTimes(2);
		expect(store.dirtyEntries()).toHaveLength(0);
	});

	it("does not call provider for TTL-evicted entries", async () => {
		const provider = makeProvider();
		const store = new MemoryStore(provider, {
			ttlMs: 10,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("data"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await Bun.sleep(20);
		await store.flush();
		expect(provider.putObject).not.toHaveBeenCalled();
	});
});

describe("MemoryStore debounce", () => {
	it("does not call provider immediately after markDirty", async () => {
		const provider = makeProvider();
		const store = new MemoryStore(provider, {
			ttlMs: 60_000,
			syncDebounceMs: 200,
		});
		await store.set(KEY_A, Buffer.from("v1"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		expect(provider.putObject).not.toHaveBeenCalled();
		store.dispose();
	});

	it("flushes after debounce window", async () => {
		const provider = makeProvider();
		const store = new MemoryStore(provider, {
			ttlMs: 60_000,
			syncDebounceMs: 50,
		});
		await store.set(KEY_A, Buffer.from("v1"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await Bun.sleep(100);
		expect(provider.putObject).toHaveBeenCalledTimes(1);
		expect(
			(
				provider.putObject as ReturnType<typeof mock>
			).mock.calls[0]?.[2]?.toString(),
		).toBe("v1");
	});

	it("resets debounce on repeated writes, flushing latest value only", async () => {
		const provider = makeProvider();
		const store = new MemoryStore(provider, {
			ttlMs: 60_000,
			syncDebounceMs: 80,
		});
		await store.set(KEY_A, Buffer.from("v1"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await Bun.sleep(40);
		await store.set(KEY_A, Buffer.from("v2"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await Bun.sleep(40);
		expect(provider.putObject).not.toHaveBeenCalled();
		await Bun.sleep(60);
		expect(provider.putObject).toHaveBeenCalledTimes(1);
		expect(
			(
				provider.putObject as ReturnType<typeof mock>
			).mock.calls[0]?.[2]?.toString(),
		).toBe("v2");
	});
});

describe("MemoryStore.delete / clear", () => {
	it("delete removes entry and dirty flag", async () => {
		const store = new MemoryStore(makeProvider(), {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("data"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await store.delete(KEY_A);
		expect(await store.get(KEY_A)).toBeNull();
		expect(store.isDirty(KEY_A)).toBe(false);
	});

	it("clear wipes all entries and dirty flags", async () => {
		const store = new MemoryStore(makeProvider(), {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("a"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await store.clear();
		expect(await store.get(KEY_A)).toBeNull();
		expect(store.dirtyEntries()).toHaveLength(0);
	});
});
