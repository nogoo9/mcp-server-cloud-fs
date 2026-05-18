// src/auth/scopes-filter.test.ts
import { describe, expect, test } from "bun:test";
import { getToolsForScopes, SCOPES, shouldRegisterTool } from "./scopes.js";

describe("getToolsForScopes", () => {
	test("admin scope returns all tools", () => {
		const tools = getToolsForScopes([SCOPES.ADMIN]);
		expect(tools.length).toBeGreaterThan(0);
		expect(tools).toContain("read_file");
		expect(tools).toContain("write_file");
		expect(tools).toContain("delete_file");
		expect(tools).toContain("shell");
	});

	test("read-only scope returns only read tools", () => {
		const tools = getToolsForScopes([SCOPES.READ]);
		expect(tools).toContain("read_file");
		expect(tools).toContain("read_text_file");
		expect(tools).toContain("get_file_info");
		expect(tools).toContain("get_presigned_url");
		expect(tools).not.toContain("write_file");
		expect(tools).not.toContain("edit_file");
		expect(tools).not.toContain("delete_file");
		expect(tools).not.toContain("shell");
		expect(tools).not.toContain("search_files");
	});

	test("write scope returns write tools", () => {
		const tools = getToolsForScopes([SCOPES.WRITE]);
		expect(tools).toContain("write_file");
		expect(tools).toContain("edit_file");
		expect(tools).toContain("create_directory");
		expect(tools).toContain("move_file");
		expect(tools).toContain("copy_file");
		expect(tools).not.toContain("read_file");
		expect(tools).not.toContain("shell");
	});

	test("search scope returns search tools", () => {
		const tools = getToolsForScopes([SCOPES.SEARCH]);
		expect(tools).toContain("search_files");
		expect(tools).toContain("grep_file");
		expect(tools).toContain("grep_files");
		expect(tools).toContain("list_directory");
		expect(tools).not.toContain("read_file");
		expect(tools).not.toContain("write_file");
	});

	test("shell scope returns shell tools", () => {
		const tools = getToolsForScopes([SCOPES.SHELL]);
		expect(tools).toContain("shell");
		expect(tools).toContain("shell_app");
		expect(tools).not.toContain("read_file");
	});

	test("combined scopes return union of tools", () => {
		const tools = getToolsForScopes([SCOPES.READ, SCOPES.WRITE]);
		expect(tools).toContain("read_file");
		expect(tools).toContain("write_file");
		expect(tools).not.toContain("shell");
		expect(tools).not.toContain("delete_file");
	});

	test("empty scopes return no tools", () => {
		const tools = getToolsForScopes([]);
		expect(tools).toHaveLength(0);
	});
});

describe("shouldRegisterTool", () => {
	test("returns true when no scopes configured (backwards-compatible)", () => {
		expect(shouldRegisterTool("write_file")).toBe(true);
		expect(shouldRegisterTool("delete_file")).toBe(true);
		expect(shouldRegisterTool("shell")).toBe(true);
	});

	test("returns true when undefined scopes passed", () => {
		expect(shouldRegisterTool("write_file", undefined)).toBe(true);
	});

	test("returns true when tool scope matches granted scopes", () => {
		expect(shouldRegisterTool("read_file", [SCOPES.READ])).toBe(true);
		expect(shouldRegisterTool("write_file", [SCOPES.WRITE])).toBe(true);
	});

	test("returns false when tool scope not in granted scopes", () => {
		expect(shouldRegisterTool("write_file", [SCOPES.READ])).toBe(false);
		expect(shouldRegisterTool("shell", [SCOPES.READ])).toBe(false);
	});

	test("admin scope grants all tools", () => {
		expect(shouldRegisterTool("write_file", [SCOPES.ADMIN])).toBe(true);
		expect(shouldRegisterTool("delete_file", [SCOPES.ADMIN])).toBe(true);
		expect(shouldRegisterTool("shell", [SCOPES.ADMIN])).toBe(true);
	});

	test("returns false for unknown tools when scopes are set", () => {
		expect(shouldRegisterTool("nonexistent_tool", [SCOPES.READ])).toBe(false);
	});
});
