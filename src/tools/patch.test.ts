// src/tools/patch.test.ts
import { describe, expect, test } from "bun:test";
import { makeProvider, makeVfs } from "./__test-helpers.js";
import {
	applyLineReplace,
	applyUnifiedDiff,
	handlePatchFile,
	parseLineReplace,
	parseUnifiedDiff,
} from "./patch.js";

const root = {
	scheme: "mem" as const,
	bucket: "test",
	prefix: "",
	uri: "mem://test",
};

describe("parseUnifiedDiff", () => {
	test("parses simple hunk", () => {
		const diff = `@@ -1,3 +1,3 @@
 line1
-line2
+LINE2
 line3`;
		const hunks = parseUnifiedDiff(diff);
		expect(hunks).toHaveLength(1);
		expect(hunks[0]!.oldStart).toBe(1);
		expect(hunks[0]!.oldCount).toBe(3);
		expect(hunks[0]!.lines).toHaveLength(4);
	});

	test("parses multiple hunks", () => {
		const diff = `@@ -1,2 +1,2 @@
 a
-b
+B
@@ -5,2 +5,2 @@
 e
-f
+F`;
		const hunks = parseUnifiedDiff(diff);
		expect(hunks).toHaveLength(2);
	});

	test("skips file headers", () => {
		const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 hello
-world
+WORLD`;
		const hunks = parseUnifiedDiff(diff);
		expect(hunks).toHaveLength(1);
	});

	test("returns empty for no hunks", () => {
		const hunks = parseUnifiedDiff("no valid content here");
		expect(hunks).toHaveLength(0);
	});
});

describe("applyUnifiedDiff", () => {
	test("replaces a line", () => {
		const content = "line1\nline2\nline3";
		const hunks = parseUnifiedDiff(`@@ -1,3 +1,3 @@
 line1
-line2
+LINE2
 line3`);
		const result = applyUnifiedDiff(content, hunks);
		expect(result).toBe("line1\nLINE2\nline3");
	});

	test("adds a line", () => {
		const content = "a\nb";
		const hunks = parseUnifiedDiff(`@@ -2,1 +2,2 @@
+c
 b`);
		const result = applyUnifiedDiff(content, hunks);
		expect(result).toBe("a\nc\nb");
	});

	test("removes a line", () => {
		const content = "a\nb\nc";
		const hunks = parseUnifiedDiff(`@@ -1,3 +1,2 @@
 a
-b
 c`);
		const result = applyUnifiedDiff(content, hunks);
		expect(result).toBe("a\nc");
	});

	test("preserves unmodified content", () => {
		const content = "first\nsecond\nthird\nfourth\nfifth";
		const hunks = parseUnifiedDiff(`@@ -2,1 +2,1 @@
-second
+SECOND`);
		const result = applyUnifiedDiff(content, hunks);
		expect(result).toBe("first\nSECOND\nthird\nfourth\nfifth");
	});
});

describe("parseLineReplace", () => {
	test("parses single replacement", () => {
		const patch = "2:3\nnew line 2\nnew line 3";
		const replacements = parseLineReplace(patch);
		expect(replacements).toHaveLength(1);
		expect(replacements[0]!.startLine).toBe(2);
		expect(replacements[0]!.endLine).toBe(3);
		expect(replacements[0]!.replacement).toBe("new line 2\nnew line 3");
	});

	test("parses multiple replacements", () => {
		const patch = "1:1\nreplacement1\n5:6\nreplacement5\nreplacement6";
		const replacements = parseLineReplace(patch);
		expect(replacements).toHaveLength(2);
	});

	test("returns empty for invalid input", () => {
		const replacements = parseLineReplace("no valid blocks");
		expect(replacements).toHaveLength(0);
	});
});

describe("applyLineReplace", () => {
	test("replaces specified line range", () => {
		const content = "a\nb\nc\nd\ne";
		const result = applyLineReplace(content, [
			{ startLine: 2, endLine: 3, replacement: "B\nC" },
		]);
		expect(result).toBe("a\nB\nC\nd\ne");
	});

	test("handles multiple non-overlapping replacements", () => {
		const content = "a\nb\nc\nd\ne";
		const result = applyLineReplace(content, [
			{ startLine: 1, endLine: 1, replacement: "A" },
			{ startLine: 5, endLine: 5, replacement: "E" },
		]);
		expect(result).toBe("A\nb\nc\nd\nE");
	});

	test("can insert more lines than replaced", () => {
		const content = "a\nb\nc";
		const result = applyLineReplace(content, [
			{ startLine: 2, endLine: 2, replacement: "b1\nb2\nb3" },
		]);
		expect(result).toBe("a\nb1\nb2\nb3\nc");
	});
});

describe("handlePatchFile", () => {
	test("applies unified diff end-to-end", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		await vfs.put(root, "file.txt", Buffer.from("hello\nworld\n"));

		const result = await handlePatchFile(
			{
				path: "mem://test/file.txt",
				patch: `@@ -1,2 +1,2 @@
 hello
-world
+WORLD`,
			},
			{ vfs, roots: [root] },
		);

		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain("Successfully patched");

		const updated = await vfs.get(root, "file.txt");
		expect(updated.toString("utf8")).toBe("hello\nWORLD\n");
	});

	test("applies line_replace end-to-end", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		await vfs.put(root, "file.txt", Buffer.from("a\nb\nc\n"));

		const result = await handlePatchFile(
			{
				path: "mem://test/file.txt",
				patch: "2:2\nB",
				format: "line_replace",
			},
			{ vfs, roots: [root] },
		);

		expect(result.isError).toBeUndefined();
		const updated = await vfs.get(root, "file.txt");
		expect(updated.toString("utf8")).toBe("a\nB\nc\n");
	});

	test("returns error for malformed unified diff", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		await vfs.put(root, "file.txt", Buffer.from("hello"));

		const result = await handlePatchFile(
			{
				path: "mem://test/file.txt",
				patch: "not a valid diff",
			},
			{ vfs, roots: [root] },
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("No valid hunks");
	});

	test("returns error for malformed line_replace", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		await vfs.put(root, "file.txt", Buffer.from("hello"));

		const result = await handlePatchFile(
			{
				path: "mem://test/file.txt",
				patch: "invalid",
				format: "line_replace",
			},
			{ vfs, roots: [root] },
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("No valid line replacement");
	});

	test("etag conflict detection", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		await vfs.put(root, "file.txt", Buffer.from("hello\nworld"));

		const result = await handlePatchFile(
			{
				path: "mem://test/file.txt",
				patch: `@@ -1,2 +1,2 @@
 hello
-world
+WORLD`,
				expected_etag: "stale-etag",
			},
			{ vfs, roots: [root] },
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Conflict");
	});

	test("includes new etag in success response", async () => {
		const provider = makeProvider();
		const vfs = makeVfs(provider);
		await vfs.put(root, "file.txt", Buffer.from("hello\nworld"));

		const result = await handlePatchFile(
			{
				path: "mem://test/file.txt",
				patch: `@@ -1,2 +1,2 @@
 hello
-world
+WORLD`,
			},
			{ vfs, roots: [root] },
		);

		expect(result.content[0].text).toContain("etag:");
	});
});
