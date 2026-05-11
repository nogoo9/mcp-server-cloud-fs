// src/tools/extended.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import {
	handleCopyFile,
	handleDeleteFile,
	handleGrepFile,
	handleGrepFiles,
	handleReadFileRange,
	registerExtendedTools,
} from "./extended.js";

const roots = [parseUri("s3://test-bucket")];
const FIVE_LINES = "alpha\nbeta\ngamma\ndelta\nepsilon";

const ctx = (
	provider = makeProvider({ getObject: mock(async () => Buffer.from(FIVE_LINES)) }),
	cache = makeCache(),
	opts: { enableDelete?: boolean; grepMaxObjects?: number } = {},
) => ({ vfs: makeVfs(provider, cache), roots, ...opts });

type T = { text: string };

describe("handleReadFileRange", () => {
	it("returns the requested window of lines (1-based offset)", async () => {
		const result = await handleReadFileRange(
			{ path: "s3://test-bucket/file.txt", offset: 2, limit: 3 },
			ctx(),
		);
		const text = (result.content[0]! as T).text;
		expect(text).toContain("beta");
		expect(text).toContain("gamma");
		expect(text).toContain("delta");
		expect(text).not.toContain("alpha");
		expect(text).not.toContain("epsilon");
	});

	it("includes line range header in output", async () => {
		const result = await handleReadFileRange(
			{ path: "s3://test-bucket/file.txt", offset: 1, limit: 2 },
			ctx(),
		);
		expect((result.content[0]! as T).text).toMatch(/Lines 1/);
	});

	it("returns partial result when limit exceeds remaining lines", async () => {
		const result = await handleReadFileRange(
			{ path: "s3://test-bucket/file.txt", offset: 4, limit: 100 },
			ctx(),
		);
		const text = (result.content[0]! as T).text;
		expect(text).toContain("delta");
		expect(text).toContain("epsilon");
	});

	it("returns empty text when offset is past EOF", async () => {
		const result = await handleReadFileRange(
			{ path: "s3://test-bucket/file.txt", offset: 99, limit: 5 },
			ctx(),
		);
		expect(result.isError).toBeFalsy();
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleReadFileRange(
			{ path: "s3://evil-bucket/file.txt", offset: 1, limit: 1 },
			ctx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Access denied");
	});
});

describe("handleGrepFile", () => {
	it("returns matching lines with 1-based line numbers", async () => {
		const result = await handleGrepFile(
			{ path: "s3://test-bucket/file.txt", pattern: "beta|gamma" },
			ctx(),
		);
		const text = (result.content[0]! as T).text;
		expect(text).toMatch(/^2:beta/m);
		expect(text).toMatch(/^3:gamma/m);
		expect(text).not.toContain("alpha");
	});

	it("returns no-match message when pattern matches nothing", async () => {
		const result = await handleGrepFile(
			{ path: "s3://test-bucket/file.txt", pattern: "zzz_not_present" },
			ctx(),
		);
		expect((result.content[0]! as T).text).toContain("No matches");
		expect(result.isError).toBeFalsy();
	});

	it("performs case-insensitive search when requested", async () => {
		const result = await handleGrepFile(
			{ path: "s3://test-bucket/file.txt", pattern: "ALPHA", case_insensitive: true },
			ctx(),
		);
		expect((result.content[0]! as T).text).toMatch(/1:alpha/);
	});

	it("returns error for invalid regex", async () => {
		const result = await handleGrepFile(
			{ path: "s3://test-bucket/file.txt", pattern: "[invalid" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleGrepFile(
			{ path: "s3://evil-bucket/file.txt", pattern: "alpha" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleGrepFiles", () => {
	const twoObjects = {
		objects: [
			{ key: "docs/readme.txt", size: 10, lastModified: new Date() },
			{ key: "src/main.ts", size: 10, lastModified: new Date() },
		],
		prefixes: [],
	};

	it("returns matching file URIs in files_with_matches mode", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => twoObjects),
			getObject: mock(async (_root, key) => {
				if (key === "docs/readme.txt") return Buffer.from("hello world");
				return Buffer.from("no match here");
			}),
		});
		const result = await handleGrepFiles(
			{ path: "s3://test-bucket", pattern: "hello" },
			ctx(provider),
		);
		const text = (result.content[0]! as T).text;
		expect(text).toContain("s3://test-bucket/docs/readme.txt");
		expect(text).not.toContain("main.ts");
	});

	it("returns matching content lines in content mode", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => twoObjects),
			getObject: mock(async (_root, key) => {
				if (key === "docs/readme.txt") return Buffer.from("line1\nhello world\nline3");
				return Buffer.from("no match here");
			}),
		});
		const result = await handleGrepFiles(
			{ path: "s3://test-bucket", pattern: "hello", output_mode: "content" },
			ctx(provider),
		);
		expect((result.content[0]! as T).text).toMatch(/docs\/readme\.txt:2:hello world/);
	});

	it("respects max_objects cap and appends truncation notice", async () => {
		const manyObjects = Array.from({ length: 5 }, (_, i) => ({
			key: `file${i}.txt`, size: 5, lastModified: new Date(),
		}));
		const provider = makeProvider({
			listObjects: mock(async () => ({ objects: manyObjects, prefixes: [] })),
			getObject: mock(async () => Buffer.from("match")),
		});
		const result = await handleGrepFiles(
			{ path: "s3://test-bucket", pattern: "match", max_objects: 2 },
			ctx(provider),
		);
		expect((result.content[0]! as T).text).toContain("capped at 2");
	});

	it("returns no-match message when nothing matches", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => twoObjects),
			getObject: mock(async () => Buffer.from("nothing here")),
		});
		const result = await handleGrepFiles(
			{ path: "s3://test-bucket", pattern: "zzz_absent" },
			ctx(provider),
		);
		expect((result.content[0]! as T).text).toContain("No files matched");
	});
});

describe("handleCopyFile", () => {
	it("uses server-side copyObject for same-bucket copies", async () => {
		const provider = makeProvider();
		const result = await handleCopyFile(
			{ source: "s3://test-bucket/a.txt", destination: "s3://test-bucket/b.txt" },
			ctx(provider),
		);
		expect(result.isError).toBeFalsy();
		expect(provider.copyObject).toHaveBeenCalledTimes(1);
		expect(provider.getObject).not.toHaveBeenCalled();
	});

	it("evicts the destination from cache after same-bucket copy", async () => {
		const cache = makeCache();
		await handleCopyFile(
			{ source: "s3://test-bucket/a.txt", destination: "s3://test-bucket/b.txt" },
			ctx(makeProvider(), cache),
		);
		expect(cache.delete).toHaveBeenCalled();
	});

	it("returns error when source is outside allowed roots", async () => {
		const result = await handleCopyFile(
			{ source: "s3://evil-bucket/a.txt", destination: "s3://test-bucket/b.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleDeleteFile", () => {
	it("calls deleteObject and evicts the cache entry", async () => {
		const provider = makeProvider();
		const cache = makeCache();
		const result = await handleDeleteFile(
			{ path: "s3://test-bucket/file.txt" },
			ctx(provider, cache),
		);
		expect(result.isError).toBeFalsy();
		expect(provider.deleteObject).toHaveBeenCalledTimes(1);
		expect(cache.delete).toHaveBeenCalled();
	});

	it("returns error when path is outside allowed roots", async () => {
		const result = await handleDeleteFile(
			{ path: "s3://evil-bucket/file.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("registerExtendedTools", () => {
	it("does NOT register delete_file when enableDelete is false", () => {
		const registered: string[] = [];
		const mockServer = {
			registerTool: mock((name: string) => { registered.push(name); }),
		} as unknown as Parameters<typeof registerExtendedTools>[0];
		registerExtendedTools(mockServer, { ...ctx(), enableDelete: false });
		expect(registered).not.toContain("delete_file");
	});

	it("DOES register delete_file when enableDelete is true", () => {
		const registered: string[] = [];
		const mockServer = {
			registerTool: mock((name: string) => { registered.push(name); }),
		} as unknown as Parameters<typeof registerExtendedTools>[0];
		registerExtendedTools(mockServer, { ...ctx(), enableDelete: true });
		expect(registered).toContain("delete_file");
	});
});
