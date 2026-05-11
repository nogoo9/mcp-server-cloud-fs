// src/vfs.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "./cache/interface.js";
import { toCacheKey } from "./path-utils.js";
import type { ParsedRoot, StorageProvider } from "./providers/interface.js";
import { VirtualFS } from "./vfs.js";

const root: ParsedRoot = {
	scheme: "s3",
	bucket: "test-bucket",
	prefix: "",
	uri: "s3://test-bucket",
};

function makeProvider(overrides?: Partial<StorageProvider>): StorageProvider {
	return {
		getObject: mock(async () => Buffer.from("provider content")),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_r, key) => ({
			key,
			size: 16,
			lastModified: new Date("2025-01-01"),
			contentType: "text/plain",
		})),
		listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		createPrefix: mock(async () => {}),
		...overrides,
	};
}

function makeCache(): CacheStore {
	const store = new Map<string, Buffer>();
	return {
		get: mock(async (key: string) => store.get(key) ?? null),
		set: mock(async (key: string, val: Buffer) => {
			store.set(key, val);
		}),
		markDirty: mock(() => {}),
		isDirty: mock(() => false),
		dirtyEntries: mock(() => []),
		delete: mock(async (key: string) => {
			store.delete(key);
		}),
		clear: mock(async () => {
			store.clear();
		}),
		flush: mock(async () => {}),
	};
}

describe("VirtualFS.get", () => {
	it("returns cache hit without calling provider", async () => {
		const provider = makeProvider();
		const cache = makeCache();
		const vfs = new VirtualFS(provider, cache);

		// Warm the cache via put
		await vfs.put(root, "file.txt", Buffer.from("cached"));
		const buf = await vfs.get(root, "file.txt");
		expect(buf.toString()).toBe("cached");
		expect(provider.getObject).not.toHaveBeenCalled();
	});

	it("falls back to provider on cache miss", async () => {
		const vfs = new VirtualFS(makeProvider(), makeCache());
		const buf = await vfs.get(root, "file.txt");
		expect(buf.toString()).toBe("provider content");
	});

	it("throws for tombstoned keys", async () => {
		const vfs = new VirtualFS(makeProvider(), makeCache());
		await vfs.put(root, "file.txt", Buffer.from("data"));
		await vfs.remove(root, "file.txt");
		await expect(vfs.get(root, "file.txt")).rejects.toThrow("File not found");
	});
});

describe("VirtualFS.stat", () => {
	it("returns inode from overlay after put", async () => {
		const vfs = new VirtualFS(makeProvider(), makeCache());
		await vfs.put(root, "file.txt", Buffer.from("hello"));
		const st = await vfs.stat(root, "file.txt");
		expect(st.size).toBe(5);
	});

	it("falls back to provider headObject on miss", async () => {
		const vfs = new VirtualFS(makeProvider(), makeCache());
		const st = await vfs.stat(root, "file.txt");
		expect(st.size).toBe(16);
		expect(st.contentType).toBe("text/plain");
	});

	it("throws for tombstoned keys", async () => {
		const vfs = new VirtualFS(makeProvider(), makeCache());
		await vfs.put(root, "f.txt", Buffer.from("x"));
		await vfs.remove(root, "f.txt");
		await expect(vfs.stat(root, "f.txt")).rejects.toThrow("File not found");
	});
});

describe("VirtualFS.list", () => {
	it("merges provider listing with VFS overlay", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "existing.txt", size: 10, lastModified: new Date() },
				],
				prefixes: [],
			})),
		});
		const vfs = new VirtualFS(provider, makeCache());
		await vfs.put(root, "new.txt", Buffer.from("new"));

		const result = await vfs.list(root, "");
		const keys = result.objects.map((o) => o.key).sort();
		expect(keys).toEqual(["existing.txt", "new.txt"]);
	});

	it("excludes tombstoned objects from provider listing", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "alive.txt", size: 1, lastModified: new Date() },
					{ key: "dead.txt", size: 1, lastModified: new Date() },
				],
				prefixes: [],
			})),
		});
		const vfs = new VirtualFS(provider, makeCache());
		await vfs.remove(root, "dead.txt");

		const result = await vfs.list(root, "");
		expect(result.objects.map((o) => o.key)).toEqual(["alive.txt"]);
	});

	it("surfaces VFS writes as sub-prefixes in delimited listing", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		});
		const vfs = new VirtualFS(provider, makeCache());
		await vfs.put(root, "subdir/file.txt", Buffer.from("x"));

		const result = await vfs.list(root, "", "/");
		expect(result.prefixes).toContain("subdir/");
	});
});

describe("VirtualFS.copy", () => {
	it("uses server-side copy for same bucket", async () => {
		const provider = makeProvider();
		const vfs = new VirtualFS(provider, makeCache());
		await vfs.copy(root, "src.txt", root, "dst.txt");
		expect(provider.copyObject).toHaveBeenCalledTimes(1);
		expect(provider.getObject).not.toHaveBeenCalled();
	});

	it("uses get+put for cross-bucket copy", async () => {
		const root2: ParsedRoot = { ...root, bucket: "other-bucket", uri: "s3://other-bucket" };
		const provider = makeProvider();
		const vfs = new VirtualFS(provider, makeCache());
		await vfs.copy(root, "src.txt", root2, "dst.txt");
		expect(provider.getObject).toHaveBeenCalledTimes(1);
		expect(provider.copyObject).not.toHaveBeenCalled();
	});
});

describe("VirtualFS.hydrate / persist", () => {
	it("round-trips inode metadata through cache", async () => {
		const cache = makeCache();
		const vfs1 = new VirtualFS(makeProvider(), cache);
		await vfs1.put(root, "file.txt", Buffer.from("hello"));

		// Create a new VFS sharing the same cache and hydrate
		const vfs2 = new VirtualFS(makeProvider(), cache);
		await vfs2.hydrate();

		const st = await vfs2.stat(root, "file.txt");
		expect(st.size).toBe(5);
	});

	it("hydrate is safe on empty cache (no-op)", async () => {
		const vfs = new VirtualFS(makeProvider(), makeCache());
		await vfs.hydrate(); // should not throw
	});
});
