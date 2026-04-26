// src/providers/gcs.integration.test.ts
import { beforeAll, describe, expect, it } from "bun:test";
import { GcsProvider } from "./gcs.js";
import type { ParsedRoot } from "./interface.js";

const SKIP = !process.env.FAKE_GCS_PORT;
const BUCKET = process.env.GCS_BUCKET ?? "test-bucket";

const root: ParsedRoot = {
	scheme: "gs",
	bucket: BUCKET,
	prefix: "",
	uri: `gs://${BUCKET}`,
};

describe.skipIf(SKIP)("GcsProvider integration (fake-gcs-server)", () => {
	let provider: GcsProvider;

	beforeAll(async () => {
		process.env.STORAGE_EMULATOR_HOST = `http://localhost:${process.env.FAKE_GCS_PORT!}`;
		provider = new GcsProvider({});
		await provider.ensureBucket(BUCKET);
	});

	const testKey = `integration-test/${Date.now()}/file.txt`;
	const testContent = Buffer.from("hello from gcs integration test");

	it("putObject and getObject round-trip", async () => {
		await provider.putObject(root, testKey, testContent);
		const result = await provider.getObject(root, testKey);
		expect(result.toString()).toBe(testContent.toString());
	});

	it("headObject returns metadata", async () => {
		const info = await provider.headObject(root, testKey);
		expect(info.size).toBe(testContent.length);
	});

	it("listObjects returns uploaded object", async () => {
		const result = await provider.listObjects(root, "integration-test/");
		expect(result.objects.some((o) => o.key === testKey)).toBe(true);
	});

	it("listObjects with delimiter returns virtual directories", async () => {
		const result = await provider.listObjects(root, "integration-test/", "/");
		expect(result.prefixes.length).toBeGreaterThan(0);
	});

	it("copyObject duplicates the object", async () => {
		const dstKey = `${testKey}.copy`;
		await provider.copyObject(root, testKey, dstKey);
		const copied = await provider.getObject(root, dstKey);
		expect(copied.toString()).toBe(testContent.toString());
	});

	it("deleteObject removes the object", async () => {
		await provider.deleteObject(root, testKey);
		await expect(provider.getObject(root, testKey)).rejects.toThrow(
			"File not found",
		);
	});

	it("createPrefix writes trailing-slash object", async () => {
		const prefix = `integration-test/${Date.now()}/emptydir`;
		await provider.createPrefix(root, prefix);
		const result = await provider.listObjects(root, `${prefix}/`);
		expect(result.objects.some((o) => o.key === `${prefix}/`)).toBe(true);
	});
});
