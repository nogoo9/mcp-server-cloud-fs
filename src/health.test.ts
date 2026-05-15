// src/health.test.ts
import { describe, expect, it } from "bun:test";
import { checkHealth, formatHealthReport } from "./health.js";
import { parseUri } from "./path-utils.js";
import { MemoryProvider } from "./providers/memory.js";

describe("checkHealth", () => {
	it("reports readable when listing succeeds", async () => {
		const provider = new MemoryProvider();
		const root = parseUri("mem://health-test");
		await provider.putObject(root, "file.txt", Buffer.from("data"));

		const report = await checkHealth(provider, root);
		expect(report.readable).toBe(true);
		expect(report.checks.find((c) => c.name === "authentication")?.passed).toBe(
			true,
		);
		expect(report.checks.find((c) => c.name === "list_access")?.passed).toBe(
			true,
		);
	});

	it("reports writable when testWrite is enabled", async () => {
		const provider = new MemoryProvider();
		const root = parseUri("mem://health-test");

		const report = await checkHealth(provider, root, { testWrite: true });
		expect(report.writable).toBe(true);
		expect(report.checks.find((c) => c.name === "write_access")?.passed).toBe(
			true,
		);
	});

	it("reports versioning support for MemoryProvider", async () => {
		const provider = new MemoryProvider();
		const root = parseUri("mem://health-test");

		const report = await checkHealth(provider, root);
		// MemoryProvider implements listObjectVersions
		expect(report.checks.find((c) => c.name === "versioning")?.passed).toBe(
			true,
		);
	});

	it("skips write test when testWrite is not set", async () => {
		const provider = new MemoryProvider();
		const root = parseUri("mem://health-test");

		const report = await checkHealth(provider, root);
		expect(report.writable).toBe(false);
		expect(
			report.checks.find((c) => c.name === "write_access"),
		).toBeUndefined();
	});
});

describe("formatHealthReport", () => {
	it("formats a passing report with checkmarks", async () => {
		const provider = new MemoryProvider();
		const root = parseUri("mem://fmt-test");
		const report = await checkHealth(provider, root);
		const output = formatHealthReport(report);

		expect(output).toContain("✓");
		expect(output).toContain("Connection OK");
		expect(output).toContain("mem://fmt-test");
	});
});
