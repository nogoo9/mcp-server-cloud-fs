// src/providers/multi.test.ts
import { describe, expect, it } from "bun:test";
import { parseUri } from "../path-utils.js";
import { MemoryProvider } from "./memory.js";
import { MultiProvider } from "./multi.js";

describe("MultiProvider", () => {
	it("routes operations to the correct provider by scheme", async () => {
		const mem1 = new MemoryProvider();
		const mem2 = new MemoryProvider();
		const multi = new MultiProvider();
		multi.register("mem", mem1);
		multi.register("s3", mem2);

		const memRoot = parseUri("mem://bucket-a");
		const s3Root = parseUri("s3://bucket-b");

		await multi.putObject(memRoot, "file.txt", Buffer.from("mem data"));
		await multi.putObject(s3Root, "file.txt", Buffer.from("s3 data"));

		// Each provider has its own data
		const memData = await multi.getObject(memRoot, "file.txt");
		expect(memData.toString()).toBe("mem data");

		const s3Data = await multi.getObject(s3Root, "file.txt");
		expect(s3Data.toString()).toBe("s3 data");
	});

	it("throws for unregistered scheme", async () => {
		const multi = new MultiProvider();
		multi.register("mem", new MemoryProvider());

		const root = parseUri("s3://unknown");
		await expect(multi.getObject(root, "file.txt")).rejects.toThrow(
			/No provider registered for scheme "s3"/,
		);
	});

	it("delegates listObjects to correct provider", async () => {
		const provider = new MemoryProvider();
		const multi = new MultiProvider();
		multi.register("mem", provider);

		const root = parseUri("mem://test");
		await provider.putObject(root, "a.txt", Buffer.from("a"));
		await provider.putObject(root, "b.txt", Buffer.from("b"));

		const listing = await multi.listObjects(root, "");
		expect(listing.objects).toHaveLength(2);
	});

	it("delegates headObject to correct provider", async () => {
		const provider = new MemoryProvider();
		const multi = new MultiProvider();
		multi.register("mem", provider);

		const root = parseUri("mem://test");
		await provider.putObject(root, "file.txt", Buffer.from("hello"));

		const info = await multi.headObject(root, "file.txt");
		expect(info.key).toBe("file.txt");
		expect(info.size).toBe(5);
	});

	it("delegates metadata operations to correct provider", async () => {
		const provider = new MemoryProvider();
		const multi = new MultiProvider();
		multi.register("mem", provider);

		const root = parseUri("mem://test");
		await provider.putObject(root, "file.txt", Buffer.from("data"));

		await multi.setObjectTags!(root, "file.txt", { env: "prod" });
		const tags = await multi.getObjectTags!(root, "file.txt");
		expect(tags).toEqual({ env: "prod" });
	});

	it("delegates versioning operations to correct provider", async () => {
		const provider = new MemoryProvider();
		const multi = new MultiProvider();
		multi.register("mem", provider);

		const root = parseUri("mem://test");
		await multi.putObject(root, "file.txt", Buffer.from("v1"));
		await multi.putObject(root, "file.txt", Buffer.from("v2"));

		const versions = await multi.listObjectVersions!(root, "file.txt");
		expect(versions).toHaveLength(2);
	});
});
