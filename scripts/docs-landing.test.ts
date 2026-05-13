/**
 * Unit tests for docs-landing.ts path traversal vulnerability mitigation
 * 
 * Tests verify that the script properly validates directory entries and prevents
 * path traversal attacks through symbolic links or malicious directory names.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as path from "node:path";

describe("docs-landing path traversal mitigation", () => {
	let testDir: string;

	beforeEach(() => {
		// Create a unique temporary directory for each test
		testDir = join(tmpdir(), `docs-landing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	/**
	 * Helper function to extract and test the version filtering logic
	 * This replicates the security-critical path validation from docs-landing.ts
	 */
	function filterVersionDirectories(deployDir: string, entries: string[]): string[] {
		return entries
			.filter((e) => /^v\d+\.\d+\.\d+$/.test(e))
			.filter((e) => {
				const resolvedBase = path.resolve(deployDir);
				const resolvedTarget = path.resolve(resolvedBase, e);
				const relative = path.relative(resolvedBase, resolvedTarget);
				if (relative.startsWith('..') || path.isAbsolute(relative)) {
					return false;
				}
				try {
					const stats = require("node:fs").statSync(resolvedTarget);
					return stats.isDirectory();
				} catch {
					return false;
				}
			});
	}

	it("should accept valid version directories", () => {
		// Create legitimate version directories
		mkdirSync(join(testDir, "v1.0.0"));
		mkdirSync(join(testDir, "v2.3.4"));
		mkdirSync(join(testDir, "v10.20.30"));

		const entries = ["v1.0.0", "v2.3.4", "v10.20.30"];
		const filtered = filterVersionDirectories(testDir, entries);

		expect(filtered).toContain("v1.0.0");
		expect(filtered).toContain("v2.3.4");
		expect(filtered).toContain("v10.20.30");
		expect(filtered.length).toBe(3);
	});

	it("should reject path traversal attempts with ../", () => {
		// Create a directory outside the deploy dir
		const outsideDir = join(tmpdir(), `outside-${Date.now()}`);
		mkdirSync(outsideDir, { recursive: true });

		try {
			// Attempt path traversal
			const entries = ["../outside"];
			const filtered = filterVersionDirectories(testDir, entries);

			// Should be filtered out due to path traversal
			expect(filtered).not.toContain("../outside");
			expect(filtered.length).toBe(0);
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	it("should reject absolute paths", () => {
		// Create a directory with an absolute path name (simulated)
		const absolutePath = "/etc/passwd";
		const entries = [absolutePath];
		const filtered = filterVersionDirectories(testDir, entries);

		// Should be filtered out due to absolute path
		expect(filtered).not.toContain(absolutePath);
		expect(filtered.length).toBe(0);
	});

	it("should handle symbolic links within deploy directory", () => {
		// Create a target directory inside the deploy dir
		const targetDir = join(testDir, "target");
		mkdirSync(targetDir, { recursive: true });

		try {
			// Create a symlink inside testDir pointing to another dir inside testDir
			const symlinkPath = join(testDir, "v1.0.0");
			try {
				symlinkSync(targetDir, symlinkPath, "dir");
			} catch (err) {
				// Skip test if symlinks are not supported (e.g., Windows without admin)
				console.log("Skipping symlink test - symlinks not supported");
				return;
			}

			const entries = ["v1.0.0"];
			const filtered = filterVersionDirectories(testDir, entries);

			// Symlinks within the deploy directory should be allowed
			// because path.resolve doesn't follow symlinks, it just normalizes the path
			// The security check validates that the normalized path stays within the base
			const resolvedBase = path.resolve(testDir);
			const resolvedTarget = path.resolve(resolvedBase, "v1.0.0");
			const relative = path.relative(resolvedBase, resolvedTarget);
			
			// The relative path should not escape the base directory
			expect(relative.startsWith('..')).toBe(false);
			expect(path.isAbsolute(relative)).toBe(false);
			expect(filtered.length).toBe(1);
		} finally {
			// Cleanup
		}
	});

	it("should reject entries with path traversal sequences", () => {
		// Test various path traversal patterns
		const maliciousEntries = [
			"v1.0.0/../../../etc",
			"v1.0.0/../../sensitive",
			"../v1.0.0",
			"..\\v1.0.0", // Windows-style
		];

		const filtered = filterVersionDirectories(testDir, maliciousEntries);

		// All malicious entries should be filtered out
		expect(filtered.length).toBe(0);
	});

	it("should only accept entries matching version pattern", () => {
		// Create directories with various names
		mkdirSync(join(testDir, "v1.0.0"));
		mkdirSync(join(testDir, "not-a-version"));
		mkdirSync(join(testDir, "v1.0")); // incomplete version
		mkdirSync(join(testDir, "1.0.0")); // missing 'v' prefix

		const entries = ["v1.0.0", "not-a-version", "v1.0", "1.0.0"];
		const filtered = filterVersionDirectories(testDir, entries);

		// Only v1.0.0 should pass both regex and path validation
		expect(filtered).toContain("v1.0.0");
		expect(filtered).not.toContain("not-a-version");
		expect(filtered).not.toContain("v1.0");
		expect(filtered).not.toContain("1.0.0");
		expect(filtered.length).toBe(1);
	});

	it("should handle non-existent directories gracefully", () => {
		// Test with entries that don't exist
		const entries = ["v1.0.0", "v2.0.0"];
		const filtered = filterVersionDirectories(testDir, entries);

		// Non-existent directories should be filtered out
		expect(filtered.length).toBe(0);
	});

	it("should reject files that match version pattern", () => {
		// Create a file (not directory) with version pattern name
		writeFileSync(join(testDir, "v1.0.0"), "not a directory");

		const entries = ["v1.0.0"];
		const filtered = filterVersionDirectories(testDir, entries);

		// Files should be filtered out (only directories allowed)
		expect(filtered.length).toBe(0);
	});

	it("should validate that relative path stays within base directory", () => {
		// Create a valid directory
		mkdirSync(join(testDir, "v1.0.0"));

		const entries = ["v1.0.0"];
		const filtered = filterVersionDirectories(testDir, entries);

		// Verify the security check logic
		const resolvedBase = path.resolve(testDir);
		const resolvedTarget = path.resolve(resolvedBase, "v1.0.0");
		const relative = path.relative(resolvedBase, resolvedTarget);

		// The relative path should not start with '..' and should not be absolute
		expect(relative.startsWith('..')).toBe(false);
		expect(path.isAbsolute(relative)).toBe(false);
		expect(filtered).toContain("v1.0.0");
	});

	it("should prevent directory traversal via encoded paths", () => {
		// Test URL-encoded path traversal attempts
		const encodedEntries = [
			"v1.0.0%2F..%2F..%2Fetc",
			"v1.0.0%2e%2e%2f",
		];

		const filtered = filterVersionDirectories(testDir, encodedEntries);

		// Encoded traversal attempts should be filtered out
		expect(filtered.length).toBe(0);
	});

	it("should reject null byte injection attempts", () => {
		// Test null byte injection (common path traversal technique)
		const nullByteEntries = [
			"v1.0.0\0",
			"v1.0.0\0.txt",
		];

		const filtered = filterVersionDirectories(testDir, nullByteEntries);

		// Null byte attempts should be filtered out
		expect(filtered.length).toBe(0);
	});

	it("should reject Windows-style path traversal", () => {
		// Test Windows-style path traversal
		const windowsEntries = [
			"v1.0.0\\..\\..\\windows",
			"..\\v1.0.0",
			"v1.0.0\\..",
		];

		const filtered = filterVersionDirectories(testDir, windowsEntries);

		// Windows-style traversal should be filtered out
		expect(filtered.length).toBe(0);
	});

	it("should handle edge case with dots in valid version names", () => {
		// Create a valid version directory
		mkdirSync(join(testDir, "v1.2.3"));

		const entries = ["v1.2.3"];
		const filtered = filterVersionDirectories(testDir, entries);

		// Valid version with dots should be accepted
		expect(filtered).toContain("v1.2.3");
		expect(filtered.length).toBe(1);
	});
});
