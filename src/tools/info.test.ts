// src/tools/info.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import { handleGetFileInfo, handleListAllowedDirectories } from "./info.js";

const roots = [
	parseUri("s3://test-bucket/allowed"),
	parseUri("s3://other-bucket"),
];

const ctx = (
	p = makeProvider({
		headObject: mock(async (_r, key) => ({
			key,
			size: 1234,
			lastModified: new Date("2025-06-15T12:00:00Z"),
			contentType: "text/plain",
		})),
	}),
) => ({ vfs: makeVfs(p, makeCache()), roots });

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
		await handleListAllowedDirectories({}, { vfs: makeVfs(provider), roots });
		expect(provider.headObject).not.toHaveBeenCalled();
		expect(provider.listObjects).not.toHaveBeenCalled();
	});
});
