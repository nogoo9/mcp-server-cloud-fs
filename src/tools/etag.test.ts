// src/tools/etag.test.ts
// Tests for ETag-based optimistic concurrency control.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { makeProvider, makeVfs } from "./__test-helpers.js";
import { handleEditFile } from "./write.js";

const root = {
	scheme: "mem" as const,
	bucket: "test",
	prefix: "",
	uri: "mem://test",
};

describe("ETag concurrency", () => {
	test("put() generates etag from content hash", async () => {
		const vfs = makeVfs();
		const content = Buffer.from("hello world");
		await vfs.put(root, "file.txt", content);

		const stat = await vfs.stat(root, "file.txt");
		const expectedHash = createHash("sha256").update(content).digest("hex");
		expect(stat.etag).toBe(expectedHash);
	});

	test("etag changes when content changes", async () => {
		const vfs = makeVfs();
		await vfs.put(root, "file.txt", Buffer.from("v1"));
		const stat1 = await vfs.stat(root, "file.txt");

		await vfs.put(root, "file.txt", Buffer.from("v2"));
		const stat2 = await vfs.stat(root, "file.txt");

		expect(stat1.etag).toBeDefined();
		expect(stat2.etag).toBeDefined();
		expect(stat1.etag).not.toBe(stat2.etag);
	});

	test("same content produces same etag", async () => {
		const vfs = makeVfs();
		await vfs.put(root, "a.txt", Buffer.from("same"));
		await vfs.put(root, "b.txt", Buffer.from("same"));

		const statA = await vfs.stat(root, "a.txt");
		const statB = await vfs.stat(root, "b.txt");

		expect(statA.etag).toBe(statB.etag);
	});

	test("edit_file succeeds when expected_etag matches", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		const roots = [root];

		// Pre-populate via VFS
		await vfs.put(root, "file.txt", Buffer.from("hello world"));
		const stat = await vfs.stat(root, "file.txt");

		const result = await handleEditFile(
			{
				path: "mem://test/file.txt",
				edits: [{ oldText: "hello", newText: "goodbye" }],
				expected_etag: stat.etag,
			},
			{ vfs, roots },
		);

		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain("Successfully edited");
		expect(result.content[0].text).toContain("etag:");
	});

	test("edit_file rejects when expected_etag mismatches", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		const roots = [root];

		await vfs.put(root, "file.txt", Buffer.from("hello world"));

		const result = await handleEditFile(
			{
				path: "mem://test/file.txt",
				edits: [{ oldText: "hello", newText: "goodbye" }],
				expected_etag: "stale-etag-12345",
			},
			{ vfs, roots },
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Conflict");
		expect(result.content[0].text).toContain("stale-etag-12345");
	});

	test("edit_file without expected_etag skips check (backwards-compatible)", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		const roots = [root];

		await vfs.put(root, "file.txt", Buffer.from("hello world"));

		const result = await handleEditFile(
			{
				path: "mem://test/file.txt",
				edits: [{ oldText: "hello", newText: "goodbye" }],
			},
			{ vfs, roots },
		);

		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain("Successfully edited");
	});

	test("edit_file returns new etag on success", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		const roots = [root];

		await vfs.put(root, "file.txt", Buffer.from("hello world"));
		const stat1 = await vfs.stat(root, "file.txt");

		const result = await handleEditFile(
			{
				path: "mem://test/file.txt",
				edits: [{ oldText: "hello", newText: "goodbye" }],
				expected_etag: stat1.etag,
			},
			{ vfs, roots },
		);

		expect(result.content[0].text).toContain("etag:");
		// The new etag should differ from the original
		const stat2 = await vfs.stat(root, "file.txt");
		expect(stat2.etag).not.toBe(stat1.etag);
	});
});
