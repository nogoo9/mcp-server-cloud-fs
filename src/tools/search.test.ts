// src/tools/search.test.ts
import { describe, expect, it } from "bun:test";
import { mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import type { ObjectInfo } from "../providers/interface.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
import { handleSearchFiles } from "./search.js";

const roots = [parseUri("s3://test-bucket")];

const files: ObjectInfo[] = [
	{ key: "src/main.ts", size: 1, lastModified: new Date() },
	{ key: "src/utils.ts", size: 1, lastModified: new Date() },
	{ key: "src/styles.css", size: 1, lastModified: new Date() },
	{ key: "node_modules/pkg/index.js", size: 1, lastModified: new Date() },
	{ key: "README.md", size: 1, lastModified: new Date() },
];

const ctx = () => ({
	vfs: makeVfs(
		makeProvider({
			listObjects: mock(async () => ({ objects: files, prefixes: [] })),
		}),
	),
	roots,
});

describe("handleSearchFiles", () => {
	it("matches files by glob pattern", async () => {
		const result = await handleSearchFiles(
			{ path: "s3://test-bucket", pattern: "**/*.ts" },
			ctx(),
		);
		const text = result.content[0]!.text;
		expect(text).toContain("src/main.ts");
		expect(text).toContain("src/utils.ts");
		expect(text).not.toContain("styles.css");
	});

	it("excludes files matching excludePatterns", async () => {
		const result = await handleSearchFiles(
			{
				path: "s3://test-bucket",
				pattern: "**/*.js",
				excludePatterns: ["**/node_modules/**"],
			},
			ctx(),
		);
		expect(result.content[0]!.text).not.toContain("node_modules");
	});

	it('returns "No matches" message when nothing matches', async () => {
		const result = await handleSearchFiles(
			{ path: "s3://test-bucket", pattern: "**/*.xyz" },
			ctx(),
		);
		expect(result.content[0]!.text).toContain("No matches");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleSearchFiles(
			{ path: "s3://evil/path", pattern: "**" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});
});
