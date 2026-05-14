// src/tools/metadata.test.ts
import { describe, expect, it } from "bun:test";
import { parseUri } from "../path-utils.js";
import { MemoryProvider } from "../providers/memory.js";
import {
	handleGetObjectMetadata,
	handleSearchByTag,
	handleSetObjectTags,
} from "./metadata.js";

type T = { text: string };

// Fully behavioral: real MemoryProvider, no mocks.
async function ctx() {
	const provider = new MemoryProvider();
	const root = parseUri("mem://meta-test");
	await provider.putObject(root, "file.txt", Buffer.from("hello"));
	await provider.putObject(root, "data/report.csv", Buffer.from("a,b,c"));
	await provider.putObject(root, "data/notes.txt", Buffer.from("notes"));
	return { roots: [root], provider };
}

describe("handleGetObjectMetadata", () => {
	it("returns metadata and empty tags for an object", async () => {
		const result = await handleGetObjectMetadata(
			{ path: "mem://meta-test/file.txt" },
			await ctx(),
		);
		expect(result.isError).toBeFalsy();
		const parsed = JSON.parse((result.content[0]! as T).text);
		expect(parsed.key).toBe("file.txt");
		expect(parsed.size).toBe(5);
		expect(parsed.contentType).toBeTruthy();
		expect(parsed.tags).toEqual({});
		expect(parsed.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("returns tags after they are set", async () => {
		const c = await ctx();
		await handleSetObjectTags(
			{ path: "mem://meta-test/file.txt", tags: { env: "prod" } },
			c,
		);
		const result = await handleGetObjectMetadata(
			{ path: "mem://meta-test/file.txt" },
			c,
		);
		const parsed = JSON.parse((result.content[0]! as T).text);
		expect(parsed.tags).toEqual({ env: "prod" });
	});

	it("returns error for nonexistent object", async () => {
		const result = await handleGetObjectMetadata(
			{ path: "mem://meta-test/missing.txt" },
			await ctx(),
		);
		expect(result.isError).toBe(true);
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleGetObjectMetadata(
			{ path: "mem://evil-bucket/file.txt" },
			await ctx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Access denied");
	});
});

describe("handleSetObjectTags", () => {
	it("sets tags on an object", async () => {
		const c = await ctx();
		const result = await handleSetObjectTags(
			{
				path: "mem://meta-test/file.txt",
				tags: { dept: "eng", env: "staging" },
			},
			c,
		);
		expect(result.isError).toBeFalsy();
		expect((result.content[0]! as T).text).toContain("Set 2 tags");

		// Verify by reading back
		const tags = await c.provider.getObjectTags!(
			parseUri("mem://meta-test"),
			"file.txt",
		);
		expect(tags).toEqual({ dept: "eng", env: "staging" });
	});

	it("replaces existing tags completely", async () => {
		const c = await ctx();
		await handleSetObjectTags(
			{ path: "mem://meta-test/file.txt", tags: { a: "1", b: "2" } },
			c,
		);
		await handleSetObjectTags(
			{ path: "mem://meta-test/file.txt", tags: { c: "3" } },
			c,
		);
		const tags = await c.provider.getObjectTags!(
			parseUri("mem://meta-test"),
			"file.txt",
		);
		// Old tags should be gone
		expect(tags).toEqual({ c: "3" });
	});

	it("returns error for nonexistent object", async () => {
		const result = await handleSetObjectTags(
			{ path: "mem://meta-test/nope.txt", tags: { a: "1" } },
			await ctx(),
		);
		expect(result.isError).toBe(true);
	});
});

describe("handleSearchByTag", () => {
	it("finds objects matching tag filters", async () => {
		const c = await ctx();
		// Tag two files, only one with the target tag
		await c.provider.setObjectTags!(
			parseUri("mem://meta-test"),
			"data/report.csv",
			{ dept: "analytics" },
		);
		await c.provider.setObjectTags!(
			parseUri("mem://meta-test"),
			"data/notes.txt",
			{ dept: "hr" },
		);

		const result = await handleSearchByTag(
			{ path: "mem://meta-test/data/", tags: { dept: "analytics" } },
			c,
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as T).text;
		expect(text).toContain("report.csv");
		expect(text).not.toContain("notes.txt");
		expect(text).toContain("Found 1 object");
	});

	it("returns no results when no objects match", async () => {
		const result = await handleSearchByTag(
			{ path: "mem://meta-test/", tags: { nonexistent: "tag" } },
			await ctx(),
		);
		expect(result.isError).toBeFalsy();
		expect((result.content[0]! as T).text).toContain("No objects found");
	});

	it("uses AND logic for multiple tags", async () => {
		const c = await ctx();
		await c.provider.setObjectTags!(parseUri("mem://meta-test"), "file.txt", {
			dept: "eng",
			env: "prod",
		});

		// Search with both tags — should match
		const r1 = await handleSearchByTag(
			{ path: "mem://meta-test/", tags: { dept: "eng", env: "prod" } },
			c,
		);
		expect((r1.content[0]! as T).text).toContain("Found 1 object");

		// Search with wrong value — should not match
		const r2 = await handleSearchByTag(
			{ path: "mem://meta-test/", tags: { dept: "eng", env: "staging" } },
			c,
		);
		expect((r2.content[0]! as T).text).toContain("No objects found");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleSearchByTag(
			{ path: "mem://evil/", tags: { a: "1" } },
			await ctx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Access denied");
	});
});
