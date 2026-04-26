// src/tools/read.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "../cache/interface.js";
import { parseUri } from "../path-utils.js";
import type { StorageProvider } from "../providers/interface.js";
import {
	handleReadMediaFile,
	handleReadMultipleFiles,
	handleReadTextFile,
} from "./read.js";

const roots = [parseUri("s3://test-bucket")];

function makeProvider(overrides?: Partial<StorageProvider>): StorageProvider {
	return {
		getObject: mock(async (_root, _key) =>
			Buffer.from("line1\nline2\nline3\nline4\nline5"),
		),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_root, key) => ({
			key,
			size: 29,
			lastModified: new Date(),
			contentType: "text/plain",
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
