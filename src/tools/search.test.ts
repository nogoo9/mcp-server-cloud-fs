// src/tools/search.test.ts
import { describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "../cache/interface.js";
import { parseUri } from "../path-utils.js";
import type { ObjectInfo, StorageProvider } from "../providers/interface.js";
import { handleSearchFiles } from "./search.js";

const roots = [parseUri("s3://test-bucket")];

const files: ObjectInfo[] = [
	{ key: "src/main.ts", size: 1, lastModified: new Date() },
	{ key: "src/utils.ts", size: 1, lastModified: new Date() },
	{ key: "src/styles.css", size: 1, lastModified: new Date() },
	{ key: "node_modules/pkg/index.js", size: 1, lastModified: new Date() },
	{ key: "README.md", size: 1, lastModified: new Date() },
];

function makeProvider(): StorageProvider {
	return {
		getObject: mock(async () => Buffer.from("")),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_r, k) => ({
			key: k,
			size: 1,
			lastModified: new Date(),
		})),
		listObjects: mock(async () => ({ objects: files, prefixes: [] })),
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
