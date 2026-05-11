// src/tools/directory.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import type { ObjectInfo } from "../providers/interface.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import {
	handleCreateDirectory,
	handleDirectoryTree,
	handleListDirectory,
	handleListDirectoryWithSizes,
} from "./directory.js";

const roots = [parseUri("s3://test-bucket")];
const ctx = (p = makeProvider()) => ({ vfs: makeVfs(p, makeCache()), roots });

describe("handleCreateDirectory", () => {
	it("calls createPrefix with the resolved key", async () => {
		const provider = makeProvider();
		await handleCreateDirectory(
			{ path: "s3://test-bucket/newdir" },
			ctx(provider),
		);
		expect(provider.createPrefix).toHaveBeenCalledTimes(1);
	});

	it("returns success message", async () => {
		const result = await handleCreateDirectory(
			{ path: "s3://test-bucket/newdir" },
			ctx(),
		);
		expect(result.content[0]?.text).toContain("Successfully");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleCreateDirectory(
			{ path: "s3://evil/dir" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleListDirectory", () => {
	it("returns [DIR] and [FILE] entries", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "subdir/file.txt", size: 100, lastModified: new Date() },
					{ key: "subdir/other.txt", size: 200, lastModified: new Date() },
				] as ObjectInfo[],
				prefixes: ["subdir/nested/"],
			})),
		});
		const result = await handleListDirectory(
			{ path: "s3://test-bucket/subdir" },
			ctx(provider),
		);
		const text = result.content[0]!.text;
		expect(text).toContain("[FILE] subdir/file.txt");
		expect(text).toContain("[DIR] subdir/nested/");
	});

	it("skips trailing-slash objects (empty dir markers)", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "dir/", size: 0, lastModified: new Date() },
				] as ObjectInfo[],
				prefixes: [],
			})),
		});
		const result = await handleListDirectory(
			{ path: "s3://test-bucket/dir" },
			ctx(provider),
		);
		expect(result.content[0]?.text).toBe("");
	});
});

describe("handleListDirectoryWithSizes", () => {
	it("sorts by size descending when sortBy is size", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "big.txt", size: 999, lastModified: new Date() },
					{ key: "small.txt", size: 1, lastModified: new Date() },
					{ key: "medium.txt", size: 500, lastModified: new Date() },
				] as ObjectInfo[],
				prefixes: [],
			})),
		});
		const result = await handleListDirectoryWithSizes(
			{ path: "s3://test-bucket/", sortBy: "size" },
			ctx(provider),
		);
		const lines = result.content[0]?.text?.split("\n").filter(Boolean);
		expect(lines[0]).toContain("big.txt");
		expect(lines[2]).toContain("small.txt");
	});

	it("sorts by name ascending by default", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "z.txt", size: 1, lastModified: new Date() },
					{ key: "a.txt", size: 1, lastModified: new Date() },
				] as ObjectInfo[],
				prefixes: [],
			})),
		});
		const result = await handleListDirectoryWithSizes(
			{ path: "s3://test-bucket/" },
			ctx(provider),
		);
		const lines = result.content[0]?.text?.split("\n").filter(Boolean);
		expect(lines[0]).toContain("a.txt");
	});
});

describe("handleDirectoryTree", () => {
	it("returns nested tree structure", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{ key: "dir/a/file1.txt", size: 1, lastModified: new Date() },
					{ key: "dir/b/file2.txt", size: 1, lastModified: new Date() },
					{ key: "dir/file3.txt", size: 1, lastModified: new Date() },
				] as ObjectInfo[],
				prefixes: [],
			})),
		});
		const result = await handleDirectoryTree(
			{ path: "s3://test-bucket/dir" },
			ctx(provider),
		);
		const text = result.content[0]!.text;
		expect(text).toContain("file1.txt");
		expect(text).toContain("file2.txt");
		expect(text).toContain("file3.txt");
	});

	it("respects excludePatterns", async () => {
		const provider = makeProvider({
			listObjects: mock(async () => ({
				objects: [
					{
						key: "dir/node_modules/pkg/index.js",
						size: 1,
						lastModified: new Date(),
					},
					{ key: "dir/src/main.ts", size: 1, lastModified: new Date() },
				] as ObjectInfo[],
				prefixes: [],
			})),
		});
		const result = await handleDirectoryTree(
			{ path: "s3://test-bucket/dir", excludePatterns: ["**/node_modules/**"] },
			ctx(provider),
		);
		const text = result.content[0]!.text;
		expect(text).not.toContain("node_modules");
		expect(text).toContain("main.ts");
	});
});
