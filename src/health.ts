// src/health.ts
// Connection health-check logic for verifying cloud storage configuration.

import type { ParsedRoot, StorageProvider } from "./providers/interface.js";

/** Result of a single health check probe. */
export interface HealthCheckResult {
	name: string;
	passed: boolean;
	message: string;
}

/** Aggregate health report for a storage root. */
export interface HealthReport {
	root: string;
	readable: boolean;
	writable: boolean;
	checks: HealthCheckResult[];
}

/**
 * Run health checks against a storage root.
 *
 * Verifies authentication, list access, and optionally write access.
 */
export async function checkHealth(
	provider: StorageProvider,
	root: ParsedRoot,
	opts: { testWrite?: boolean } = {},
): Promise<HealthReport> {
	const checks: HealthCheckResult[] = [];
	let readable = false;
	let writable = false;

	// 1. Authentication + List access
	try {
		await provider.listObjects(root, root.prefix, "/");
		checks.push({
			name: "authentication",
			passed: true,
			message: "Authenticated and can list objects",
		});
		checks.push({
			name: "list_access",
			passed: true,
			message: `Prefix "${root.prefix || "(root)"}" is listable`,
		});
		readable = true;
	} catch (err) {
		checks.push({
			name: "authentication",
			passed: false,
			message: `Failed: ${(err as Error).message}`,
		});
		checks.push({
			name: "list_access",
			passed: false,
			message: `Cannot list prefix: ${(err as Error).message}`,
		});
	}

	// 2. Write access (optional)
	if (opts.testWrite && readable) {
		const testKey = root.prefix
			? `${root.prefix}/.cloud-fs-health-check`
			: ".cloud-fs-health-check";
		try {
			await provider.putObject(root, testKey, Buffer.from("health-check"));
			await provider.deleteObject(root, testKey);
			checks.push({
				name: "write_access",
				passed: true,
				message: "Write and delete operations succeeded",
			});
			writable = true;
		} catch (err) {
			checks.push({
				name: "write_access",
				passed: false,
				message: `Write test failed: ${(err as Error).message}`,
			});
		}
	}

	// 3. Versioning support (informational)
	if (provider.listObjectVersions) {
		checks.push({
			name: "versioning",
			passed: true,
			message: "Provider supports version listing",
		});
	} else {
		checks.push({
			name: "versioning",
			passed: false,
			message: "Versioning not supported by this provider",
		});
	}

	return {
		root: root.uri,
		readable,
		writable,
		checks,
	};
}

/**
 * Format health report for terminal output.
 */
export function formatHealthReport(report: HealthReport): string {
	const lines = [`Health check for ${report.root}:`, ""];
	for (const check of report.checks) {
		const icon = check.passed ? "✓" : "✗";
		lines.push(`  ${icon} ${check.name}: ${check.message}`);
	}
	lines.push("");
	const status = report.readable
		? "Connection OK — ready for MCP clients."
		: "Connection FAILED.";
	lines.push(status);
	return lines.join("\n");
}
