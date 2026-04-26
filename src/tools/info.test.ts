// src/tools/info.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "../cache/interface.js";
import { parseUri } from "../path-utils.js";
import type { StorageProvider } from "../providers/interface.js";
import { handleGetFileInfo, handleListAllowedDirectories } from "./info.js";

const roots = [
	parseUri("s3://test-bucket/allowed"),
	parseUri("s3://other-bucket"),
];

function makeProvider(): StorageProvider {
	return {
		getObject: mock(async () => Buffer.from("")),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_r, key) => ({
			key,
			size: 1234,
			lastModified: new Date("2025-06-15T12:00:00Z"),
			contentType: "text/plain",
		})),
		listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		createPrefix: mock(async () => {}),
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

const ctx = () => ({ provider: makeProvider(), cache: makeCache(), roots });

describe("handleGetFileInfo", () => {
	it("returns file metadata including size, lastModified, contentType", async () => {
		const result = await handleGetFileInfo(
			{ path: "s3://test-bucket/allowed/file.txt" },
			ctx(),
		);
		const text = result.content[0]!.text;
		expect(text).toContain("1234");
		expect(text).toContain("text/plain");
		expect(text).toContain("2025");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleGetFileInfo(
			{ path: "s3://evil/file.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleListAllowedDirectories", () => {
	it("returns all configured root URIs", async () => {
		const result = await handleListAllowedDirectories({}, ctx());
		const text = result.content[0]!.text;
		expect(text).toContain("s3://test-bucket/allowed");
		expect(text).toContain("s3://other-bucket");
	});

	it("makes no provider calls", async () => {
		const provider = makeProvider();
		await handleListAllowedDirectories(
			{},
			{ provider, cache: makeCache(), roots },
		);
		expect(provider.headObject).not.toHaveBeenCalled();
		expect(provider.listObjects).not.toHaveBeenCalled();
	});
});
