// src/providers/azure.integration.test.ts
import { beforeAll, describe, expect, it } from "bun:test";
import { AzureProvider } from "./azure.js";
import type { ParsedRoot } from "./interface.js";

const CONN_STR =
	process.env.AZURITE_CONNECTION_STRING ??
	"DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";
const CONTAINER = process.env.AZURE_CONTAINER ?? "test-container";

// Probe the Azurite blob endpoint — skip the suite if it is not reachable
// or incompatible (e.g. API version mismatch).
let reachable = false;
try {
	const probe = new AzureProvider({ connectionString: CONN_STR });
	// Race against a timeout so a slow/hanging emulator doesn't block the suite.
	await Promise.race([
		probe.ensureContainer(CONTAINER),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error("probe timeout")), 3000),
		),
	]);
	reachable = true;
} catch {
	// endpoint not reachable or incompatible — tests will be skipped
}

const root: ParsedRoot = {
	scheme: "az",
	bucket: CONTAINER,
	prefix: "",
	uri: `az://${CONTAINER}`,
};

describe.skipIf(!reachable)("AzureProvider integration (Azurite)", () => {
	let provider: AzureProvider;

	beforeAll(() => {
		provider = new AzureProvider({ connectionString: CONN_STR });
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
