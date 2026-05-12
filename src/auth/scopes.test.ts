// src/auth/scopes.test.ts
import { describe, expect, test } from "bun:test";
import {
	ALL_SCOPES,
	SCOPES,
	getRequiredScope,
	hasScope,
	parseScopes,
} from "./scopes.js";

describe("SCOPES", () => {
	test("has all expected scope values", () => {
		expect(SCOPES.READ).toBe("cloud-fs:read");
		expect(SCOPES.WRITE).toBe("cloud-fs:write");
		expect(SCOPES.DELETE).toBe("cloud-fs:delete");
		expect(SCOPES.SEARCH).toBe("cloud-fs:search");
		expect(SCOPES.SHELL).toBe("cloud-fs:shell");
		expect(SCOPES.ADMIN).toBe("cloud-fs:admin");
	});

	test("ALL_SCOPES contains all scope values", () => {
		expect(ALL_SCOPES).toHaveLength(6);
		expect(ALL_SCOPES).toContain(SCOPES.READ);
		expect(ALL_SCOPES).toContain(SCOPES.ADMIN);
	});
});

describe("getRequiredScope", () => {
	test("returns correct scope for read tools", () => {
		expect(getRequiredScope("read_file")).toBe(SCOPES.READ);
		expect(getRequiredScope("read_text_file")).toBe(SCOPES.READ);
		expect(getRequiredScope("read_media_file")).toBe(SCOPES.READ);
		expect(getRequiredScope("read_multiple_files")).toBe(SCOPES.READ);
		expect(getRequiredScope("read_file_range")).toBe(SCOPES.READ);
	});

	test("returns correct scope for write tools", () => {
		expect(getRequiredScope("write_file")).toBe(SCOPES.WRITE);
		expect(getRequiredScope("edit_file")).toBe(SCOPES.WRITE);
		expect(getRequiredScope("create_directory")).toBe(SCOPES.WRITE);
	});

	test("returns correct scope for delete tools", () => {
		expect(getRequiredScope("delete_file")).toBe(SCOPES.DELETE);
	});

	test("returns correct scope for search tools", () => {
		expect(getRequiredScope("search_files")).toBe(SCOPES.SEARCH);
		expect(getRequiredScope("grep_file")).toBe(SCOPES.SEARCH);
		expect(getRequiredScope("grep_files")).toBe(SCOPES.SEARCH);
		expect(getRequiredScope("list_directory")).toBe(SCOPES.SEARCH);
		expect(getRequiredScope("directory_tree")).toBe(SCOPES.SEARCH);
	});

	test("returns correct scope for shell tools", () => {
		expect(getRequiredScope("shell")).toBe(SCOPES.SHELL);
		expect(getRequiredScope("shell_app")).toBe(SCOPES.SHELL);
	});

	test("returns undefined for unknown tool", () => {
		expect(getRequiredScope("nonexistent_tool")).toBeUndefined();
	});
});

describe("hasScope", () => {
	test("grants access with matching scope", () => {
		expect(hasScope(["cloud-fs:read"], "read_file")).toBe(true);
		expect(hasScope(["cloud-fs:write"], "write_file")).toBe(true);
		expect(hasScope(["cloud-fs:delete"], "delete_file")).toBe(true);
	});

	test("denies access with missing scope", () => {
		expect(hasScope(["cloud-fs:read"], "write_file")).toBe(false);
		expect(hasScope(["cloud-fs:write"], "delete_file")).toBe(false);
		expect(hasScope([], "read_file")).toBe(false);
	});

	test("admin scope grants access to everything", () => {
		const adminScopes = ["cloud-fs:admin"];
		expect(hasScope(adminScopes, "read_file")).toBe(true);
		expect(hasScope(adminScopes, "write_file")).toBe(true);
		expect(hasScope(adminScopes, "delete_file")).toBe(true);
		expect(hasScope(adminScopes, "shell")).toBe(true);
		expect(hasScope(adminScopes, "grep_files")).toBe(true);
	});

	test("multiple scopes checked correctly", () => {
		const scopes = ["cloud-fs:read", "cloud-fs:write"];
		expect(hasScope(scopes, "read_file")).toBe(true);
		expect(hasScope(scopes, "write_file")).toBe(true);
		expect(hasScope(scopes, "delete_file")).toBe(false);
	});

	test("returns false for unknown tool (no matching scope)", () => {
		expect(hasScope(["cloud-fs:read"], "nonexistent_tool")).toBe(false);
	});
});

describe("parseScopes", () => {
	test("parses space-separated scopes", () => {
		expect(parseScopes("cloud-fs:read cloud-fs:write")).toEqual([
			"cloud-fs:read",
			"cloud-fs:write",
		]);
	});

	test("handles single scope", () => {
		expect(parseScopes("cloud-fs:admin")).toEqual(["cloud-fs:admin"]);
	});

	test("handles empty string", () => {
		expect(parseScopes("")).toEqual([]);
	});

	test("handles extra whitespace", () => {
		expect(parseScopes("  cloud-fs:read   cloud-fs:write  ")).toEqual([
			"cloud-fs:read",
			"cloud-fs:write",
		]);
	});
});
