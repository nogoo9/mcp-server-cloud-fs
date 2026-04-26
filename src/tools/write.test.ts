// src/tools/write.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "../cache/interface.js";
import { parseUri } from "../path-utils.js";
import type { StorageProvider } from "../providers/interface.js";
import { handleEditFile, handleWriteFile } from "./write.js";

const roots = [parseUri("s3://test-bucket")];

function makeProvider(overrides?: Partial<StorageProvider>): StorageProvider {
	return {
		getObject: mock(async () =>
			Buffer.from("original line1\noriginal line2\n"),
		),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_r, key) => ({
			key,
			size: 30,
			lastModified: new Date(),
		})),
		listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		createPrefix: mock(async () => {}),
		...overrides,
	};
}

function makeCache(hit: Buffer | null = null): CacheStore {
	return {
		get: mock(async () => hit),
		set: mock(async () => {}),
		markDirty: mock(() => {}),
		isDirty: mock(() => false),
		dirtyEntries: mock(() => []),
		delete: mock(async () => {}),
		clear: mock(async () => {}),
		flush: mock(async () => {}),
	};
}

const ctx = (p = makeProvider(), c = makeCache()) => ({
	provider: p,
	cache: c,
	roots,
});

describe("handleWriteFile", () => {
	it("writes to cache and marks dirty (no direct putObject)", async () => {
		const provider = makeProvider();
		const cache = makeCache();
		await handleWriteFile(
			{ path: "s3://test-bucket/new.txt", content: "hello" },
			ctx(provider, cache),
		);
		expect(provider.putObject).not.toHaveBeenCalled();
		expect(cache.set).toHaveBeenCalled();
		expect(cache.markDirty).toHaveBeenCalled();
	});

	it("returns success message", async () => {
		const result = await handleWriteFile(
			{ path: "s3://test-bucket/file.txt", content: "data" },
			ctx(),
		);
		expect(result.content[0]?.text).toContain("Successfully");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleWriteFile(
			{ path: "s3://evil-bucket/file.txt", content: "x" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleEditFile", () => {
	it("applies edit and writes result to cache", async () => {
		const cache = makeCache();
		await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [{ oldText: "original line1", newText: "new line1" }],
			},
			ctx(makeProvider(), cache),
		);
		expect(cache.set).toHaveBeenCalled();
		expect(cache.markDirty).toHaveBeenCalled();
		const written = (cache.set as ReturnType<typeof mock>).mock
			.calls[0]![1] as Buffer;
		expect(written.toString()).toContain("new line1");
		expect(written.toString()).not.toContain("original line1");
	});

	it("uses cache for read when cache hits (zero provider.getObject calls)", async () => {
		const provider = makeProvider();
		const cache = makeCache(Buffer.from("cached content\n"));
		await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [{ oldText: "cached content", newText: "new content" }],
			},
			ctx(provider, cache),
		);
		expect(provider.getObject).not.toHaveBeenCalled();
	});

	it("returns error when oldText not found", async () => {
		const result = await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [{ oldText: "does not exist", newText: "x" }],
			},
			ctx(),
		);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("not found");
	});

	it("dryRun returns preview without writing", async () => {
		const cache = makeCache();
		const result = await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [{ oldText: "original line1", newText: "new line1" }],
				dryRun: true,
			},
			ctx(makeProvider(), cache),
		);
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("original line1");
		expect(result.content[0]?.text).toContain("new line1");
		expect(cache.markDirty).not.toHaveBeenCalled();
	});

	it("applies multiple edits sequentially", async () => {
		const provider = makeProvider({
			getObject: mock(async () => Buffer.from("AAA BBB CCC")),
		});
		const cache = makeCache();
		await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [
					{ oldText: "AAA", newText: "aaa" },
					{ oldText: "BBB", newText: "bbb" },
				],
			},
			ctx(provider, cache),
		);
		const written = (cache.set as ReturnType<typeof mock>).mock
			.calls[0]![1] as Buffer;
		expect(written.toString()).toBe("aaa bbb CCC");
	});
});
