// src/providers/sqlite.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedRoot } from "./interface.js";
import { SqliteProvider } from "./sqlite.js";

const ROOT: ParsedRoot = {
	scheme: "sqlite",
	bucket: "test-bucket",
	prefix: "",
	uri: "sqlite://test-bucket",
};

function makeTmpDb(): string {
	return join(
		tmpdir(),
		`cloud-fs-test-${Date.now()}-${randomBytes(4).toString("hex")}.db`,
	);
}

describe("SqliteProvider", () => {
	const dbs: string[] = [];

	async function createProvider(): Promise<SqliteProvider> {
		const path = makeTmpDb();
		dbs.push(path);
		return SqliteProvider.create({ dbPath: path });
	}

	afterEach(() => {
		for (const db of dbs) {
			try {
				unlinkSync(db);
			} catch {
				/* ignore */
			}
			try {
				unlinkSync(`${db}-wal`);
			} catch {
				/* ignore */
			}
			try {
				unlinkSync(`${db}-shm`);
			} catch {
				/* ignore */
			}
		}
		dbs.length = 0;
	});

	it("put and get an object", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "hello.txt", Buffer.from("world"));
		const result = await p.getObject(ROOT, "hello.txt");
		expect(result.toString()).toBe("world");
		p.close();
	});

	it("throws on get non-existent key", async () => {
		const p = await createProvider();
		await expect(p.getObject(ROOT, "nope")).rejects.toThrow("File not found");
		p.close();
	});

	it("supports range reads", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "data.txt", Buffer.from("abcdefghij"));
		const slice = await p.getObject(ROOT, "data.txt", {
			startByte: 2,
			endByte: 5,
		});
		expect(slice.toString()).toBe("cdef");
		p.close();
	});

	it("deletes an object", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "temp.txt", Buffer.from("gone"));
		await p.deleteObject(ROOT, "temp.txt");
		await expect(p.getObject(ROOT, "temp.txt")).rejects.toThrow(
			"File not found",
		);
		p.close();
	});

	it("copies an object", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "src.txt", Buffer.from("data"));
		await p.copyObject(ROOT, "src.txt", "dst.txt");
		expect((await p.getObject(ROOT, "dst.txt")).toString()).toBe("data");
		p.close();
	});

	it("throws on copy non-existent source", async () => {
		const p = await createProvider();
		await expect(p.copyObject(ROOT, "nope", "dst")).rejects.toThrow(
			"File not found",
		);
		p.close();
	});

	it("heads an object", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "info.txt", Buffer.from("hello"));
		const info = await p.headObject(ROOT, "info.txt");
		expect(info.key).toBe("info.txt");
		expect(info.size).toBe(5);
		expect(info.contentType).toBe("text/plain");
		expect(info.lastModified).toBeInstanceOf(Date);
		p.close();
	});

	it("throws on head non-existent key", async () => {
		const p = await createProvider();
		await expect(p.headObject(ROOT, "nope")).rejects.toThrow("File not found");
		p.close();
	});

	it("lists objects without delimiter", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "a/1.txt", Buffer.from(""));
		await p.putObject(ROOT, "a/2.txt", Buffer.from(""));
		await p.putObject(ROOT, "b/3.txt", Buffer.from(""));
		const result = await p.listObjects(ROOT, "a/");
		expect(result.objects.length).toBe(2);
		expect(result.prefixes.length).toBe(0);
		p.close();
	});

	it("lists objects with delimiter", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "dir/sub/file.txt", Buffer.from(""));
		await p.putObject(ROOT, "dir/root.txt", Buffer.from(""));
		const result = await p.listObjects(ROOT, "dir/", "/");
		expect(result.objects.length).toBe(1);
		expect(result.objects[0]!.key).toBe("dir/root.txt");
		expect(result.prefixes).toEqual(["dir/sub/"]);
		p.close();
	});

	it("creates a prefix", async () => {
		const p = await createProvider();
		await p.createPrefix(ROOT, "mydir");
		const result = await p.listObjects(ROOT, "mydir/");
		expect(result.objects.length).toBe(1);
		expect(result.objects[0]!.key).toBe("mydir/");
		p.close();
	});

	it("persists data across instances", async () => {
		const dbPath = makeTmpDb();
		dbs.push(dbPath);
		const p1 = await SqliteProvider.create({ dbPath });
		await p1.putObject(ROOT, "persist.txt", Buffer.from("durable"));
		p1.close();

		const p2 = await SqliteProvider.create({ dbPath });
		const result = await p2.getObject(ROOT, "persist.txt");
		expect(result.toString()).toBe("durable");
		p2.close();
	});

	it("overwrites existing keys", async () => {
		const p = await createProvider();
		await p.putObject(ROOT, "ow.txt", Buffer.from("v1"));
		await p.putObject(ROOT, "ow.txt", Buffer.from("v2"));
		expect((await p.getObject(ROOT, "ow.txt")).toString()).toBe("v2");
		p.close();
	});

	it("isolates buckets", async () => {
		const p = await createProvider();
		const root2: ParsedRoot = {
			scheme: "sqlite",
			bucket: "other-bucket",
			prefix: "",
			uri: "sqlite://other-bucket",
		};
		await p.putObject(ROOT, "shared.txt", Buffer.from("a"));
		await p.putObject(root2, "shared.txt", Buffer.from("b"));
		expect((await p.getObject(ROOT, "shared.txt")).toString()).toBe("a");
		expect((await p.getObject(root2, "shared.txt")).toString()).toBe("b");
		p.close();
	});
});
