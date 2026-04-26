// src/tools/move.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "../cache/interface.js";
import { parseUri } from "../path-utils.js";
import type { StorageProvider } from "../providers/interface.js";
import { handleMoveFile } from "./move.js";

const roots = [parseUri("s3://bucket-a"), parseUri("s3://bucket-b")];

function makeProvider(overrides?: Partial<StorageProvider>): StorageProvider {
	return {
		getObject: mock(async () => Buffer.from("file content")),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_r, k) => ({
			key: k,
			size: 12,
			lastModified: new Date(),
		})),
		listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		createPrefix: mock(async () => {}),
		...overrides,
	};
}

function makeCache(): CacheStore {
	return {
		get: mock(async () => null),
		set: mock(async () => {}),
		markDirty: mock(() => {}),
		isDirty: mock(() => false),
		dirtyEntries: mock(() => []),
		delete: mock(async () => {}),
		clear: mock(async () => {}),
		flush: mock(async () => {}),
	};
}

const ctx = (p = makeProvider()) => ({
	provider: p,
	cache: makeCache(),
	roots,
});

describe("handleMoveFile — same bucket", () => {
	it("uses server-side copyObject + deleteObject (no getObject/putObject)", async () => {
		const provider = makeProvider();
		const result = await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://bucket-a/dst.txt" },
			ctx(provider),
		);
		expect(result.isError).toBeFalsy();
		expect(provider.copyObject).toHaveBeenCalledTimes(1);
		expect(provider.deleteObject).toHaveBeenCalledTimes(1);
		expect(provider.getObject).not.toHaveBeenCalled();
		expect(provider.putObject).not.toHaveBeenCalled();
	});

	it("invalidates destination cache and deletes source from cache", async () => {
		const cache = makeCache();
		await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://bucket-a/dst.txt" },
			{ provider: makeProvider(), cache, roots },
		);
		expect(cache.delete).toHaveBeenCalledTimes(2);
	});
});

describe("handleMoveFile — cross-bucket", () => {
	it("uses download + cache write + delete (no copyObject, no direct putObject)", async () => {
		const provider = makeProvider();
		const cache = makeCache();
		const result = await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://bucket-b/dst.txt" },
			{ provider, cache, roots },
		);
		expect(result.isError).toBeFalsy();
		expect(provider.getObject).toHaveBeenCalledTimes(1);
		expect(provider.putObject).not.toHaveBeenCalled();
		expect(provider.deleteObject).toHaveBeenCalledTimes(1);
		expect(provider.copyObject).not.toHaveBeenCalled();
		expect(cache.set).toHaveBeenCalledTimes(1);
		expect(cache.markDirty).toHaveBeenCalledTimes(1);
	});
});

describe("handleMoveFile — validation", () => {
	it("denies source outside allowed roots", async () => {
		const result = await handleMoveFile(
			{ source: "s3://evil/src.txt", destination: "s3://bucket-a/dst.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("Access denied");
	});

	it("denies destination outside allowed roots", async () => {
		const result = await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://evil/dst.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});

	it("returns success message", async () => {
		const result = await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://bucket-a/dst.txt" },
			ctx(),
		);
		expect(result.content[0]?.text).toContain("Successfully");
	});
});
