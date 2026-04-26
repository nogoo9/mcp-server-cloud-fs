// src/cache/filesystem.test.ts
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import { FilesystemStore } from "./filesystem.js";

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

let cacheDir: string;
beforeEach(async () => {
	cacheDir = await mkdtemp(join(tmpdir(), "cloud-fs-test-"));
});
afterEach(async () => {
	await rm(cacheDir, { recursive: true, force: true });
});

describe("FilesystemStore.get / set", () => {
	it("returns null on miss", async () => {
		const store = new FilesystemStore(makeProvider(), cacheDir, {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		expect(await store.get(KEY_A)).toBeNull();
	});

	it("persists and retrieves data", async () => {
		const store = new FilesystemStore(makeProvider(), cacheDir, {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		await store.set(KEY_A, Buffer.from("persisted"));
		expect((await store.get(KEY_A))?.toString()).toBe("persisted");
	});

	it("returns null after TTL", async () => {
		const store = new FilesystemStore(makeProvider(), cacheDir, {
			ttlMs: 20,
			syncDebounceMs: 100,
		});
		await store.set(KEY_A, Buffer.from("data"));
		await Bun.sleep(30);
		expect(await store.get(KEY_A)).toBeNull();
	});

	it("survives across store instances (disk persistence)", async () => {
		const store1 = new FilesystemStore(makeProvider(), cacheDir, {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		await store1.set(KEY_A, Buffer.from("on-disk"));
		const store2 = new FilesystemStore(makeProvider(), cacheDir, {
			ttlMs: 60_000,
			syncDebounceMs: 100,
		});
		expect((await store2.get(KEY_A))?.toString()).toBe("on-disk");
	});
});

describe("FilesystemStore.flush", () => {
	it("flushes dirty entries to provider", async () => {
		const provider = makeProvider();
		const store = new FilesystemStore(provider, cacheDir, {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("content"));
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

describe("FilesystemStore.delete", () => {
	it("removes file and dirty flag", async () => {
		const store = new FilesystemStore(makeProvider(), cacheDir, {
			ttlMs: 60_000,
			syncDebounceMs: 100_000,
		});
		await store.set(KEY_A, Buffer.from("data"));
		store.markDirty(KEY_A, mockRoot, "a.txt");
		await store.delete(KEY_A);
		expect(await store.get(KEY_A)).toBeNull();
		expect(store.isDirty(KEY_A)).toBe(false);
	});
});
