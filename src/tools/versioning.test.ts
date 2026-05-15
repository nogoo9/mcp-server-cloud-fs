// src/tools/versioning.test.ts
import { describe, expect, it } from "bun:test";
import { parseUri } from "../path-utils.js";
import { MemoryProvider } from "../providers/memory.js";
import { handleListVersions, handleRestoreVersion } from "./versioning.js";

type T = { text: string };

// Fully behavioral: real MemoryProvider, no mocks.
function ctx() {
	const provider = new MemoryProvider();
	const root = parseUri("mem://ver-test");
	return { roots: [root], provider, root };
}

describe("handleListVersions", () => {
	it("returns version history for an object", async () => {
		const c = ctx();
		await c.provider.putObject(c.root, "file.txt", Buffer.from("v1"));
		await c.provider.putObject(c.root, "file.txt", Buffer.from("v2 content"));

		const result = await handleListVersions(
			{ path: "mem://ver-test/file.txt" },
			c,
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as T).text;
		expect(text).toContain("2 versions");
		expect(text).toContain("v1");
		expect(text).toContain("v2");
		expect(text).toContain("[latest]");
	});

	it("limits results to max_versions", async () => {
		const c = ctx();
		for (let i = 0; i < 5; i++) {
			await c.provider.putObject(c.root, "multi.txt", Buffer.from(`ver${i}`));
		}

		const result = await handleListVersions(
			{ path: "mem://ver-test/multi.txt", max_versions: 2 },
			c,
		);
		const text = (result.content[0]! as T).text;
		expect(text).toContain("2 versions");
	});

	it("returns error for nonexistent object", async () => {
		const result = await handleListVersions(
			{ path: "mem://ver-test/missing.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleListVersions(
			{ path: "mem://evil/file.txt" },
			ctx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Access denied");
	});
});

describe("handleRestoreVersion", () => {
	it("restores an older version of an object", async () => {
		const c = ctx();
		await c.provider.putObject(c.root, "file.txt", Buffer.from("original"));
		await c.provider.putObject(c.root, "file.txt", Buffer.from("modified"));

		// Verify current content is "modified"
		const current = await c.provider.getObject(c.root, "file.txt");
		expect(current.toString()).toBe("modified");

		// Restore to v1
		const result = await handleRestoreVersion(
			{ path: "mem://ver-test/file.txt", version_id: "v1" },
			c,
		);
		expect(result.isError).toBeFalsy();
		expect((result.content[0]! as T).text).toContain("Restored");
		expect((result.content[0]! as T).text).toContain("v1");

		// Verify content is back to "original"
		const restored = await c.provider.getObject(c.root, "file.txt");
		expect(restored.toString()).toBe("original");
	});

	it("returns error for nonexistent version", async () => {
		const c = ctx();
		await c.provider.putObject(c.root, "file.txt", Buffer.from("data"));

		const result = await handleRestoreVersion(
			{ path: "mem://ver-test/file.txt", version_id: "v999" },
			c,
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("not found");
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleRestoreVersion(
			{ path: "mem://evil/file.txt", version_id: "v1" },
			ctx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Access denied");
	});
});
