// src/providers/gcs.integration.test.ts
import { beforeAll, describe, expect, it } from "bun:test";
import { GcsProvider } from "./gcs.js";
import type { ParsedRoot } from "./interface.js";

const GCS_PORT = process.env.FAKE_GCS_PORT ?? "4443";
const GCS_HOST = `http://localhost:${GCS_PORT}`;
const BUCKET = process.env.GCS_BUCKET ?? "test-bucket";

// Probe the fake-gcs-server — skip the suite if it is not reachable or
// the SDK is incompatible (e.g. checksum validation failures).
let reachable = false;
try {
	process.env.STORAGE_EMULATOR_HOST = GCS_HOST;
	const probe = new GcsProvider({});
	// Ensure the bucket exists via the emulator's REST API (faster than SDK).
	await fetch(`${GCS_HOST}/storage/v1/b?project=test`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: BUCKET }),
		signal: AbortSignal.timeout(2000),
	});
	// Try a trivial write + read to verify SDK compatibility.
	const probeRoot: ParsedRoot = {
		scheme: "gs",
		bucket: BUCKET,
		prefix: "",
		uri: `gs://${BUCKET}`,
	};
	await probe.putObject(probeRoot, "__probe__", Buffer.from("ok"));
	await probe.deleteObject(probeRoot, "__probe__");
	reachable = true;
} catch {
	// endpoint not reachable or SDK incompatible — tests will be skipped
}

const root: ParsedRoot = {
	scheme: "gs",
	bucket: BUCKET,
	prefix: "",
	uri: `gs://${BUCKET}`,
};

describe.skipIf(!reachable)("GcsProvider integration (fake-gcs-server)", () => {
	let provider: GcsProvider;

	beforeAll(() => {
		process.env.STORAGE_EMULATOR_HOST = GCS_HOST;
		provider = new GcsProvider({});
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
