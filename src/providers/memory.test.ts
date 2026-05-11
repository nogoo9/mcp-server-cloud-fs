// src/providers/memory.test.ts
import { describe, expect, it } from "bun:test";
import type { ParsedRoot } from "./interface.js";
import { MemoryProvider } from "./memory.js";

const ROOT: ParsedRoot = {
	scheme: "mem",
	bucket: "test-bucket",
	prefix: "",
	uri: "mem://test-bucket",
};

describe("MemoryProvider", () => {
	it("put and get an object", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "hello.txt", Buffer.from("world"));
		const result = await p.getObject(ROOT, "hello.txt");
		expect(result.toString()).toBe("world");
	});

	it("throws on get non-existent key", async () => {
		const p = new MemoryProvider();
		await expect(p.getObject(ROOT, "nope")).rejects.toThrow("File not found");
	});

	it("supports range reads", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "data.txt", Buffer.from("abcdefghij"));
		const slice = await p.getObject(ROOT, "data.txt", {
			startByte: 2,
			endByte: 5,
		});
		expect(slice.toString()).toBe("cdef");
	});

	it("deletes an object", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "temp.txt", Buffer.from("gone"));
		await p.deleteObject(ROOT, "temp.txt");
		await expect(p.getObject(ROOT, "temp.txt")).rejects.toThrow(
			"File not found",
		);
	});

	it("copies an object", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "src.txt", Buffer.from("data"));
		await p.copyObject(ROOT, "src.txt", "dst.txt");
		expect((await p.getObject(ROOT, "dst.txt")).toString()).toBe("data");
		// Mutation independence
		await p.putObject(ROOT, "src.txt", Buffer.from("changed"));
		expect((await p.getObject(ROOT, "dst.txt")).toString()).toBe("data");
	});

	it("throws on copy non-existent source", async () => {
		const p = new MemoryProvider();
		await expect(p.copyObject(ROOT, "nope", "dst")).rejects.toThrow(
			"File not found",
		);
	});

	it("heads an object", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "info.txt", Buffer.from("hello"));
		const info = await p.headObject(ROOT, "info.txt");
		expect(info.key).toBe("info.txt");
		expect(info.size).toBe(5);
		expect(info.contentType).toBe("text/plain");
		expect(info.lastModified).toBeInstanceOf(Date);
	});

	it("throws on head non-existent key", async () => {
		const p = new MemoryProvider();
		await expect(p.headObject(ROOT, "nope")).rejects.toThrow("File not found");
	});

	it("lists objects without delimiter", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "a/1.txt", Buffer.from(""));
		await p.putObject(ROOT, "a/2.txt", Buffer.from(""));
		await p.putObject(ROOT, "b/3.txt", Buffer.from(""));
		const result = await p.listObjects(ROOT, "a/");
		expect(result.objects.length).toBe(2);
		expect(result.prefixes.length).toBe(0);
	});

	it("lists objects with delimiter", async () => {
		const p = new MemoryProvider();
		await p.putObject(ROOT, "dir/sub/file.txt", Buffer.from(""));
		await p.putObject(ROOT, "dir/root.txt", Buffer.from(""));
		const result = await p.listObjects(ROOT, "dir/", "/");
		expect(result.objects.length).toBe(1);
		expect(result.objects[0]!.key).toBe("dir/root.txt");
		expect(result.prefixes).toEqual(["dir/sub/"]);
	});

	it("creates a prefix", async () => {
		const p = new MemoryProvider();
		await p.createPrefix(ROOT, "mydir");
		const result = await p.listObjects(ROOT, "mydir/");
		expect(result.objects.length).toBe(1);
		expect(result.objects[0]!.key).toBe("mydir/");
	});

	it("isolates buckets", async () => {
		const p = new MemoryProvider();
		const root2: ParsedRoot = {
			scheme: "mem",
			bucket: "other-bucket",
			prefix: "",
			uri: "mem://other-bucket",
		};
		await p.putObject(ROOT, "shared.txt", Buffer.from("a"));
		await p.putObject(root2, "shared.txt", Buffer.from("b"));
		expect((await p.getObject(ROOT, "shared.txt")).toString()).toBe("a");
		expect((await p.getObject(root2, "shared.txt")).toString()).toBe("b");
	});
});
