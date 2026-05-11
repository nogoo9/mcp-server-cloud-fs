// src/tools/shell.test.ts
// Unit tests for the shell tool — parser, individual commands, pipelines.

import { describe, expect, mock, test } from "bun:test";
import type { ParsedRoot } from "../providers/interface.js";
import { makeCache, makeProvider, makeVfs } from "./__test-helpers.js";
// Commands
import { cat } from "./shell/commands/cat.js";
import { cp } from "./shell/commands/cp.js";
import { diff } from "./shell/commands/diff.js";
import { echo } from "./shell/commands/echo.js";
import { grep } from "./shell/commands/grep.js";
import { head } from "./shell/commands/head.js";
import { mkdir } from "./shell/commands/mkdir.js";
import { mv } from "./shell/commands/mv.js";
import { rm } from "./shell/commands/rm.js";
import { stat } from "./shell/commands/stat.js";
import { tail } from "./shell/commands/tail.js";
import { touch } from "./shell/commands/touch.js";
import { wc } from "./shell/commands/wc.js";
// Integration
import { executeShell } from "./shell/index.js";
import { parseCommand, tokenize } from "./shell/parser.js";
import type { ShellContext } from "./shell/types.js";

const ROOT: ParsedRoot = {
	scheme: "s3",
	bucket: "test-bucket",
	prefix: "",
	uri: "s3://test-bucket",
};

function makeCtx(overrides?: {
	content?: string;
	enableDelete?: boolean;
}): ShellContext {
	const content = overrides?.content ?? "line1\nline2\nline3\nline4\nline5";
	const provider = makeProvider({
		getObject: mock(async () => Buffer.from(content)),
	});
	const cache = makeCache();
	const vfs = makeVfs(provider, cache);
	return {
		vfs,
		roots: [ROOT],
		enableDelete: overrides?.enableDelete ?? false,
	};
}

// ── Parser tests ──────────────────────────────────────────────────────────

describe("tokenize", () => {
	test("splits simple command", () => {
		expect(tokenize("ls -l s3://bucket")).toEqual(["ls", "-l", "s3://bucket"]);
	});

	test("handles single quotes", () => {
		expect(tokenize("grep 'hello world' s3://b/f")).toEqual([
			"grep",
			"hello world",
			"s3://b/f",
		]);
	});

	test("handles double quotes", () => {
		expect(tokenize('echo "hello world"')).toEqual(["echo", "hello world"]);
	});

	test("handles backslash escapes", () => {
		expect(tokenize("echo hello\\ world")).toEqual(["echo", "hello world"]);
	});

	test("handles pipe token", () => {
		expect(tokenize("cat s3://b/f | grep test")).toEqual([
			"cat",
			"s3://b/f",
			"|",
			"grep",
			"test",
		]);
	});

	test("handles redirect tokens", () => {
		expect(tokenize("echo hello > s3://b/out")).toEqual([
			"echo",
			"hello",
			">",
			"s3://b/out",
		]);
	});
});

describe("parseCommand", () => {
	test("parses single command", () => {
		const result = parseCommand("ls -l s3://bucket");
		expect(result.stages).toHaveLength(1);
		expect(result.stages[0]!.command).toBe("ls");
		expect(result.stages[0]!.args).toEqual(["-l", "s3://bucket"]);
	});

	test("parses pipeline", () => {
		const result = parseCommand("cat s3://b/f | grep test | wc -l");
		expect(result.stages).toHaveLength(3);
		expect(result.stages[0]!.command).toBe("cat");
		expect(result.stages[1]!.command).toBe("grep");
		expect(result.stages[2]!.command).toBe("wc");
	});

	test("parses output redirect", () => {
		const result = parseCommand("echo hello > s3://b/out");
		expect(result.stages).toHaveLength(1);
		expect(result.stages[0]!.command).toBe("echo");
		expect(result.outputRedirect).toEqual({
			mode: "write",
			path: "s3://b/out",
		});
	});

	test("parses append redirect", () => {
		const result = parseCommand("echo hello >> s3://b/out");
		expect(result.outputRedirect).toEqual({
			mode: "append",
			path: "s3://b/out",
		});
	});

	test("parses input redirect", () => {
		const result = parseCommand("grep test < s3://b/in");
		expect(result.inputRedirect).toEqual({
			mode: "read",
			path: "s3://b/in",
		});
	});

	test("throws on empty command", () => {
		expect(() => parseCommand("")).toThrow("empty command");
	});

	test("throws on empty command before pipe", () => {
		expect(() => parseCommand("| grep test")).toThrow("empty command");
	});
});

// ── Command tests ─────────────────────────────────────────────────────────

describe("echo", () => {
	test("returns text", async () => {
		const ctx = makeCtx();
		expect(await echo(["hello", "world"], ctx, null)).toBe("hello world");
	});

	test("handles -n flag", async () => {
		const ctx = makeCtx();
		expect(await echo(["-n", "hello"], ctx, null)).toBe("hello");
	});

	test("returns empty string with no args", async () => {
		const ctx = makeCtx();
		expect(await echo([], ctx, null)).toBe("");
	});
});

describe("cat", () => {
	test("reads file content", async () => {
		const ctx = makeCtx({ content: "hello world" });
		const result = await cat(["s3://test-bucket/file.txt"], ctx, null);
		expect(result).toBe("hello world");
	});

	test("passes through stdin with no args", async () => {
		const ctx = makeCtx();
		expect(await cat([], ctx, "piped input")).toBe("piped input");
	});
});

describe("head", () => {
	test("returns first 10 lines by default", async () => {
		const ctx = makeCtx();
		const result = await head(["s3://test-bucket/f"], ctx, null);
		expect(result).toBe("line1\nline2\nline3\nline4\nline5");
	});

	test("returns first N lines", async () => {
		const ctx = makeCtx();
		const result = await head(["-n", "2", "s3://test-bucket/f"], ctx, null);
		expect(result).toBe("line1\nline2");
	});

	test("works on stdin", async () => {
		const ctx = makeCtx();
		const result = await head(["-n", "1"], ctx, "a\nb\nc");
		expect(result).toBe("a");
	});
});

describe("tail", () => {
	test("returns last N lines", async () => {
		const ctx = makeCtx();
		const result = await tail(["-n", "2", "s3://test-bucket/f"], ctx, null);
		expect(result).toBe("line4\nline5");
	});

	test("works on stdin", async () => {
		const ctx = makeCtx();
		const result = await tail(["-n", "1"], ctx, "a\nb\nc");
		expect(result).toBe("c");
	});
});

describe("grep", () => {
	test("finds matching lines", async () => {
		const ctx = makeCtx({ content: "foo\nbar\nbaz\nfoo2" });
		const result = await grep(["foo", "s3://test-bucket/f"], ctx, null);
		expect(result).toBe("foo\nfoo2");
	});

	test("with -n shows line numbers", async () => {
		const ctx = makeCtx({ content: "foo\nbar\nbaz" });
		const result = await grep(["-n", "bar", "s3://test-bucket/f"], ctx, null);
		expect(result).toBe("2:bar");
	});

	test("with -i is case insensitive", async () => {
		const ctx = makeCtx({ content: "Hello\nhello\nHELLO" });
		const result = await grep(["-i", "hello", "s3://test-bucket/f"], ctx, null);
		expect(result).toBe("Hello\nhello\nHELLO");
	});

	test("reads from stdin", async () => {
		const ctx = makeCtx();
		const result = await grep(["line2"], ctx, "line1\nline2\nline3");
		expect(result).toBe("line2");
	});

	test("with -c returns count", async () => {
		const ctx = makeCtx({ content: "a\nb\na" });
		const result = await grep(["-c", "a", "s3://test-bucket/f"], ctx, null);
		expect(result).toBe("2");
	});
});

describe("wc", () => {
	test("counts all by default", async () => {
		const ctx = makeCtx({ content: "hello world\nfoo bar" });
		const result = await wc(["s3://test-bucket/f"], ctx, null);
		expect(result).toContain("2"); // 2 lines
		expect(result).toContain("4"); // 4 words
	});

	test("-l counts lines only", async () => {
		const ctx = makeCtx({ content: "a\nb\nc" });
		const result = await wc(["-l", "s3://test-bucket/f"], ctx, null);
		expect(result.trim()).toBe("3 s3://test-bucket/f");
	});

	test("reads from stdin", async () => {
		const ctx = makeCtx();
		const result = await wc(["-l"], ctx, "a\nb");
		expect(result.trim()).toBe("2");
	});
});

describe("stat", () => {
	test("shows file metadata", async () => {
		const ctx = makeCtx();
		const result = await stat(["s3://test-bucket/file.txt"], ctx, null);
		expect(result).toContain("File:");
		expect(result).toContain("Size:");
		expect(result).toContain("n/a — cloud object storage has no permissions");
	});
});

describe("cp", () => {
	test("copies a file", async () => {
		const ctx = makeCtx();
		await expect(
			cp(["s3://test-bucket/a.txt", "s3://test-bucket/b.txt"], ctx, null),
		).resolves.toBe("");
	});

	test("fails without enough args", async () => {
		const ctx = makeCtx();
		await expect(cp(["s3://test-bucket/a.txt"], ctx, null)).rejects.toThrow(
			"missing file operand",
		);
	});
});

describe("mv", () => {
	test("fails without enable-delete", async () => {
		const ctx = makeCtx({ enableDelete: false });
		await expect(
			mv(["s3://test-bucket/a.txt", "s3://test-bucket/b.txt"], ctx, null),
		).rejects.toThrow("--enable-delete");
	});

	test("moves with enable-delete", async () => {
		const ctx = makeCtx({ enableDelete: true });
		await expect(
			mv(["s3://test-bucket/a.txt", "s3://test-bucket/b.txt"], ctx, null),
		).resolves.toBe("");
	});
});

describe("rm", () => {
	test("fails without enable-delete", async () => {
		const ctx = makeCtx({ enableDelete: false });
		await expect(rm(["s3://test-bucket/a.txt"], ctx, null)).rejects.toThrow(
			"--enable-delete",
		);
	});

	test("removes with enable-delete", async () => {
		const ctx = makeCtx({ enableDelete: true });
		await expect(rm(["s3://test-bucket/a.txt"], ctx, null)).resolves.toBe("");
	});
});

describe("mkdir", () => {
	test("creates a directory", async () => {
		const ctx = makeCtx();
		await expect(mkdir(["s3://test-bucket/newdir"], ctx, null)).resolves.toBe(
			"",
		);
	});
});

describe("touch", () => {
	test("creates an empty file", async () => {
		const provider = makeProvider({
			getObject: mock(async () => {
				throw new Error("not found");
			}),
		});
		const cache = makeCache();
		const vfs = makeVfs(provider, cache);
		const ctx: ShellContext = { vfs, roots: [ROOT] };
		await expect(touch(["s3://test-bucket/new.txt"], ctx, null)).resolves.toBe(
			"",
		);
	});
});

describe("diff", () => {
	test("returns empty for identical files", async () => {
		const ctx = makeCtx({ content: "same content" });
		const result = await diff(
			["s3://test-bucket/a.txt", "s3://test-bucket/b.txt"],
			ctx,
			null,
		);
		expect(result).toBe("");
	});

	test("shows differences", async () => {
		let callCount = 0;
		const provider = makeProvider({
			getObject: mock(async () => {
				callCount++;
				return Buffer.from(callCount <= 1 ? "line A" : "line B");
			}),
		});
		const cache = makeCache();
		const vfs = makeVfs(provider, cache);
		const ctx: ShellContext = { vfs, roots: [ROOT] };
		const result = await diff(
			["s3://test-bucket/a.txt", "s3://test-bucket/b.txt"],
			ctx,
			null,
		);
		expect(result).toContain("-line A");
		expect(result).toContain("+line B");
	});
});

// ── Pipeline / executeShell integration tests ─────────────────────────────

describe("executeShell", () => {
	test("runs simple command", async () => {
		const ctx = makeCtx({ content: "hello" });
		const result = await executeShell("cat s3://test-bucket/file.txt", ctx);
		expect(result).toBe("hello");
	});

	test("runs pipeline", async () => {
		const ctx = makeCtx({ content: "foo\nbar\nbaz" });
		const result = await executeShell("cat s3://test-bucket/f | grep bar", ctx);
		expect(result).toBe("bar");
	});

	test("handles echo pipe", async () => {
		const ctx = makeCtx();
		const result = await executeShell("echo hello world | wc -w", ctx);
		expect(result.trim()).toBe("2");
	});

	test("output redirect writes to VFS", async () => {
		const provider = makeProvider();
		const cache = makeCache();
		const vfs = makeVfs(provider, cache);
		const ctx: ShellContext = { vfs, roots: [ROOT] };

		await executeShell("echo hello > s3://test-bucket/out.txt", ctx);
		// Output should be consumed (redirected to file)
		const result = await executeShell(
			"echo hello > s3://test-bucket/out.txt",
			ctx,
		);
		expect(result).toBe("");
	});

	test("unknown command throws", async () => {
		const ctx = makeCtx();
		await expect(
			executeShell("nonexistent s3://test-bucket/f", ctx),
		).rejects.toThrow("command not found");
	});

	test("path outside roots throws", async () => {
		const ctx = makeCtx();
		await expect(
			executeShell("cat s3://other-bucket/secret", ctx),
		).rejects.toThrow("Access denied");
	});
});
