// src/tools/write.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import { handleEditFile, handleWriteFile } from "./write.js";

const roots = [parseUri("s3://test-bucket")];
const ctx = (
	p = makeProvider({ getObject: mock(async () => Buffer.from("original line1\noriginal line2\n")) }),
	c = makeCache(),
) => ({ vfs: makeVfs(p, c), roots });

describe("handleWriteFile", () => {
	it("writes content via VFS (put triggers cache set + markDirty)", async () => {
		const cache = makeCache();
		const result = await handleWriteFile(
			{ path: "s3://test-bucket/new.txt", content: "hello" },
			ctx(makeProvider(), cache),
		);
		expect(result.content[0]?.text).toContain("Successfully");
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
	it("applies edit and writes result via VFS", async () => {
		const cache = makeCache();
		const provider = makeProvider({ getObject: mock(async () => Buffer.from("original line1\noriginal line2\n")) });
		await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [{ oldText: "original line1", newText: "new line1" }],
			},
			ctx(provider, cache),
		);
		expect(cache.set).toHaveBeenCalled();
		expect(cache.markDirty).toHaveBeenCalled();
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
		const provider = makeProvider({ getObject: mock(async () => Buffer.from("original line1\noriginal line2\n")) });
		const result = await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [{ oldText: "original line1", newText: "new line1" }],
				dryRun: true,
			},
			ctx(provider, cache),
		);
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("original line1");
		expect(result.content[0]?.text).toContain("new line1");
		// markDirty is only called via put — dry run reads but doesn't put,
		// however VFS.get also calls cache.set for caching reads. markDirty should not be called for reads.
		expect(cache.markDirty).not.toHaveBeenCalled();
	});

	it("applies multiple edits sequentially", async () => {
		const provider = makeProvider({
			getObject: mock(async () => Buffer.from("AAA BBB CCC")),
		});
		const cache = makeCache();
		const c = ctx(provider, cache);
		await handleEditFile(
			{
				path: "s3://test-bucket/file.txt",
				edits: [
					{ oldText: "AAA", newText: "aaa" },
					{ oldText: "BBB", newText: "bbb" },
				],
			},
			c,
		);
		// Read back through VFS to verify edits applied
		const readback = await c.vfs.get(roots[0]!, "file.txt");
		expect(readback.toString()).toBe("aaa bbb CCC");
	});
});
