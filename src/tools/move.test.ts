// src/tools/move.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import { handleMoveFile } from "./move.js";

const roots = [parseUri("s3://bucket-a"), parseUri("s3://bucket-b")];

const ctx = (
	p = makeProvider({ getObject: mock(async () => Buffer.from("file content")) }),
	c = makeCache(),
) => ({ vfs: makeVfs(p, c), roots });

describe("handleMoveFile — same bucket", () => {
	it("uses server-side copyObject + deleteObject", async () => {
		const provider = makeProvider({
			getObject: mock(async () => Buffer.from("file content")),
		});
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

	it("invalidates destination cache", async () => {
		const cache = makeCache();
		const provider = makeProvider({
			getObject: mock(async () => Buffer.from("file content")),
		});
		await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://bucket-a/dst.txt" },
			ctx(provider, cache),
		);
		expect(cache.delete).toHaveBeenCalled();
	});
});

describe("handleMoveFile — cross-bucket", () => {
	it("uses download + VFS put + delete", async () => {
		const provider = makeProvider({
			getObject: mock(async () => Buffer.from("file content")),
		});
		const cache = makeCache();
		const result = await handleMoveFile(
			{ source: "s3://bucket-a/src.txt", destination: "s3://bucket-b/dst.txt" },
			ctx(provider, cache),
		);
		expect(result.isError).toBeFalsy();
		expect(provider.getObject).toHaveBeenCalledTimes(1);
		expect(provider.putObject).not.toHaveBeenCalled();
		expect(provider.deleteObject).toHaveBeenCalledTimes(1);
		expect(provider.copyObject).not.toHaveBeenCalled();
		expect(cache.set).toHaveBeenCalled();
		expect(cache.markDirty).toHaveBeenCalled();
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
