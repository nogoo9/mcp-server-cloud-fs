// src/tools/read.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import { MemoryProvider } from "../providers/memory.js";
import { VirtualFS } from "../vfs.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import {
	handleReadFileChunk,
	handleReadMediaFile,
	handleReadMultipleFiles,
	handleReadTextFile,
} from "./read.js";

const roots = [parseUri("s3://test-bucket")];
const ctx = (p = makeProvider(), c = makeCache()) => ({
	vfs: makeVfs(p, c),
	roots,
});

type AsText = { text: string };
type AsImage = { type: "image"; data: string; mimeType: string };

describe("handleReadTextFile", () => {
	it("reads full file content as UTF-8", async () => {
		const result = await handleReadTextFile(
			{ path: "s3://test-bucket/file.txt" },
			ctx(),
		);
		expect((result.content[0]! as AsText).text).toContain("line1");
	});

	it("serves from cache when available", async () => {
		const provider = makeProvider();
		const cache = makeCache(Buffer.from("cached content"));
		const result = await handleReadTextFile(
			{ path: "s3://test-bucket/file.txt" },
			ctx(provider, cache),
		);
		expect((result.content[0]! as AsText).text).toBe("cached content");
		expect(provider.getObject).not.toHaveBeenCalled();
	});

	it("stores result in cache on miss", async () => {
		const cache = makeCache();
		await handleReadTextFile(
			{ path: "s3://test-bucket/file.txt" },
			ctx(makeProvider(), cache),
		);
		expect(cache.set).toHaveBeenCalled();
	});

	it("returns first N lines when head is specified", async () => {
		const result = await handleReadTextFile(
			{ path: "s3://test-bucket/file.txt", head: 2 },
			ctx(),
		);
		const lines = (result.content[0]! as AsText).text.split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe("line1");
	});

	it("returns last N lines when tail is specified", async () => {
		const result = await handleReadTextFile(
			{ path: "s3://test-bucket/file.txt", tail: 2 },
			ctx(),
		);
		const lines = (result.content[0]! as AsText).text.split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[1]).toBe("line5");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleReadTextFile(
			{ path: "s3://evil-bucket/file.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as AsText).text).toContain("Access denied");
	});

	it("returns error when file not found", async () => {
		const provider = makeProvider({
			getObject: mock(async () => {
				throw new Error("File not found: s3://test-bucket/missing.txt");
			}),
		});
		const result = await handleReadTextFile(
			{ path: "s3://test-bucket/missing.txt" },
			ctx(provider),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleReadMediaFile", () => {
	it("returns base64-encoded content with correct mimeType", async () => {
		const provider = makeProvider({
			getObject: mock(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])),
		});
		const result = await handleReadMediaFile(
			{ path: "s3://test-bucket/image.png" },
			ctx(provider),
		);
		expect(result.content[0]?.type).toBe("image");
		expect((result.content[0]! as AsImage).mimeType).toBe("image/png");
		expect(typeof (result.content[0]! as AsImage).data).toBe("string");
	});
});

describe("handleReadMultipleFiles", () => {
	it("reads multiple files in parallel", async () => {
		let callCount = 0;
		const provider = makeProvider({
			getObject: mock(async (_root, key) => {
				callCount++;
				return Buffer.from(`content of ${key}`);
			}),
		});
		const result = await handleReadMultipleFiles(
			{ paths: ["s3://test-bucket/a.txt", "s3://test-bucket/b.txt"] },
			ctx(provider),
		);
		expect(callCount).toBe(2);
		expect(result.content).toHaveLength(2);
	});

	it("returns per-file error without failing the whole call", async () => {
		const provider = makeProvider({
			getObject: mock(async (_root, key) => {
				if (key === "missing.txt") throw new Error("File not found");
				return Buffer.from("ok");
			}),
		});
		const result = await handleReadMultipleFiles(
			{ paths: ["s3://test-bucket/ok.txt", "s3://test-bucket/missing.txt"] },
			ctx(provider),
		);
		expect(result.content).toHaveLength(2);
		expect((result.content[1]! as AsText).text).toContain("Error");
	});
});

describe("handleReadFileChunk", () => {
	const FILE_CONTENT =
		"Hello, World! This is test content for byte-range reads.";

	// Behavioral setup: real MemoryProvider + real VFS, no mocks
	async function chunkCtx() {
		const provider = new MemoryProvider();
		const root = parseUri("mem://chunk-test");
		await provider.putObject(root, "file.txt", Buffer.from(FILE_CONTENT));
		const vfs = new VirtualFS(provider, makeCache());
		return { vfs, roots: [root] };
	}

	it("reads a specific byte range as utf8", async () => {
		const result = await handleReadFileChunk(
			{
				path: "mem://chunk-test/file.txt",
				start_byte: 0,
				end_byte: 4,
				encoding: "utf8",
			},
			await chunkCtx(),
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as AsText).text;
		expect(text).toContain("Hello");
		expect(text).toContain("Bytes 0");
	});

	it("reads to end of file when end_byte is omitted", async () => {
		const start = FILE_CONTENT.length - 5;
		const result = await handleReadFileChunk(
			{
				path: "mem://chunk-test/file.txt",
				start_byte: start,
				encoding: "utf8",
			},
			await chunkCtx(),
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as AsText).text;
		expect(text).toContain("eads.");
	});

	it("returns base64-encoded content when encoding is base64", async () => {
		const result = await handleReadFileChunk(
			{
				path: "mem://chunk-test/file.txt",
				start_byte: 0,
				end_byte: 4,
				encoding: "base64",
			},
			await chunkCtx(),
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as AsText).text;
		// "Hello" in base64 is "SGVsbG8="
		expect(text).toContain("SGVsbG8=");
	});

	it("returns error when start_byte is past EOF", async () => {
		const result = await handleReadFileChunk(
			{
				path: "mem://chunk-test/file.txt",
				start_byte: 9999,
				encoding: "utf8",
			},
			await chunkCtx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as AsText).text).toContain("past end of file");
	});

	it("clamps end_byte to file size", async () => {
		const result = await handleReadFileChunk(
			{
				path: "mem://chunk-test/file.txt",
				start_byte: 0,
				end_byte: 99999,
				encoding: "utf8",
			},
			await chunkCtx(),
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as AsText).text;
		expect(text).toContain(FILE_CONTENT);
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleReadFileChunk(
			{
				path: "mem://evil-bucket/file.txt",
				start_byte: 0,
				encoding: "utf8",
			},
			await chunkCtx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as AsText).text).toContain("Access denied");
	});

	it("includes total file size in response header", async () => {
		const result = await handleReadFileChunk(
			{
				path: "mem://chunk-test/file.txt",
				start_byte: 0,
				end_byte: 4,
				encoding: "utf8",
			},
			await chunkCtx(),
		);
		const text = (result.content[0]! as AsText).text;
		expect(text).toContain(`${FILE_CONTENT.length} total`);
	});
});
