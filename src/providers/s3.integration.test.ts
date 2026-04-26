// src/providers/s3.integration.test.ts
import { beforeAll, describe, expect, it } from "bun:test";
import type { ParsedRoot } from "./interface.js";
import { S3Provider } from "./s3.js";

const SKIP = !process.env.MINIO_ENDPOINT;
const ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const BUCKET = process.env.MINIO_BUCKET ?? "test-bucket";

const root: ParsedRoot = {
	scheme: "s3",
	bucket: BUCKET,
	prefix: "",
	uri: `s3://${BUCKET}`,
};

describe.skipIf(SKIP)("S3Provider integration (MinIO)", () => {
	let provider: S3Provider;

	beforeAll(() => {
		process.env.AWS_ACCESS_KEY_ID = "minioadmin";
		process.env.AWS_SECRET_ACCESS_KEY = "minioadmin";
		provider = new S3Provider({ region: "us-east-1", endpoint: ENDPOINT });
	});

	const testKey = `integration-test/${Date.now()}/file.txt`;
	const testContent = Buffer.from("hello from s3 integration test");

	it("putObject and getObject round-trip", async () => {
		await provider.putObject(root, testKey, testContent);
		const result = await provider.getObject(root, testKey);
		expect(result.toString()).toBe(testContent.toString());
	});

	it("getObject with byte range (head lines)", async () => {
		const content = Buffer.from("line1\nline2\nline3\n");
		await provider.putObject(root, `${testKey}.range`, content);
		const partial = await provider.getObject(root, `${testKey}.range`, {
			startByte: 0,
			endByte: 4,
		});
		expect(partial.toString()).toBe("line1");
	});

	it("headObject returns correct metadata", async () => {
		const info = await provider.headObject(root, testKey);
		expect(info.key).toBe(testKey);
		expect(info.size).toBe(testContent.length);
		expect(info.lastModified).toBeInstanceOf(Date);
	});

	it("listObjects returns uploaded object", async () => {
		const result = await provider.listObjects(root, `integration-test/`);
		expect(result.objects.some((o) => o.key === testKey)).toBe(true);
	});

	it("listObjects with delimiter returns prefixes", async () => {
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
		await expect(provider.getObject(root, testKey)).rejects.toThrow();
	});

	it("createPrefix writes trailing-slash object", async () => {
		const prefix = `integration-test/${Date.now()}/emptydir`;
		await provider.createPrefix(root, prefix);
		const result = await provider.listObjects(root, `${prefix}/`);
		expect(result.objects.some((o) => o.key === `${prefix}/`)).toBe(true);
	});
});
