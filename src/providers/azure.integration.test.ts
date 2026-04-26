// src/providers/azure.integration.test.ts
import { beforeAll, describe, expect, it } from "bun:test";
import { AzureProvider } from "./azure.js";
import type { ParsedRoot } from "./interface.js";

const SKIP = !process.env.AZURITE_CONNECTION_STRING;
const CONTAINER = process.env.AZURE_CONTAINER ?? "test-container";

const root: ParsedRoot = {
	scheme: "az",
	bucket: CONTAINER,
	prefix: "",
	uri: `az://${CONTAINER}`,
};

describe.skipIf(SKIP)("AzureProvider integration (Azurite)", () => {
	let provider: AzureProvider;

	beforeAll(async () => {
		const connStr = process.env.AZURITE_CONNECTION_STRING!;
		provider = new AzureProvider({ connectionString: connStr });
		await provider.ensureContainer(CONTAINER);
	});

	const testKey = `integration-test/${Date.now()}/file.txt`;
	const testContent = Buffer.from("hello from azure integration test");

	it("putObject and getObject round-trip", async () => {
		await provider.putObject(root, testKey, testContent);
		const result = await provider.getObject(root, testKey);
		expect(result.toString()).toBe(testContent.toString());
	});

	it("headObject returns metadata", async () => {
		const info = await provider.headObject(root, testKey);
		expect(info.size).toBe(testContent.length);
	});

	it("listObjects returns uploaded blob", async () => {
		const result = await provider.listObjects(root, "integration-test/");
		expect(result.objects.some((o) => o.key === testKey)).toBe(true);
	});

	it("listObjects with delimiter returns virtual directories", async () => {
		const result = await provider.listObjects(root, "integration-test/", "/");
		expect(result.prefixes.length).toBeGreaterThan(0);
	});

	it("copyObject duplicates the blob", async () => {
		const dstKey = `${testKey}.copy`;
		await provider.copyObject(root, testKey, dstKey);
		const copied = await provider.getObject(root, dstKey);
		expect(copied.toString()).toBe(testContent.toString());
	});

	it("deleteObject removes the blob", async () => {
		await provider.deleteObject(root, testKey);
		await expect(provider.getObject(root, testKey)).rejects.toThrow(
			"File not found",
		);
	});

	it("createPrefix writes trailing-slash blob", async () => {
		const prefix = `integration-test/${Date.now()}/emptydir`;
		await provider.createPrefix(root, prefix);
		const result = await provider.listObjects(root, `${prefix}/`);
		expect(result.objects.some((o) => o.key === `${prefix}/`)).toBe(true);
	});
});
