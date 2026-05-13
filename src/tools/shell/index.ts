// src/tools/shell/index.ts
// Shell tool — MCP registration and public programmatic API.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ParsedRoot } from "../../providers/interface.js";
import type { VirtualFS } from "../../vfs.js";
import { parseCommandList } from "./parser.js";
import { COMMANDS } from "./registry.js";
import { resolveShellPath } from "./resolve.js";
import type { ShellContext } from "./types.js";

export { resolveShellPath } from "./resolve.js";
// Re-export types for programmatic consumers
export type { ShellCommandHandler, ShellContext } from "./types.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	enableDelete?: boolean;
};

type TextToolResult = {
	content: [{ type: "text"; text: string }];
	isError?: boolean;
};

function ok(text: string): TextToolResult {
	return { content: [{ type: "text", text }] };
}

function err(text: string): TextToolResult {
	return { isError: true, content: [{ type: "text", text }] };
}

/**
 * Execute a shell command string against the VFS.
 *
 * This is the **programmatic API** — use it without MCP.
 *
 * @example
 * ```ts
 * import { executeShell, VirtualFS } from "@nogoo9/mcp-server-cloud-fs";
 *
 * const result = await executeShell("ls -l s3://my-bucket", {
 *   vfs,
 *   roots,
 *   enableDelete: false,
 * });
 * console.log(result);
 * ```
 *
 * @category Shell
 */
export async function executeShell(
	command: string,
	ctx: ShellContext,
): Promise<string> {
	const list = parseCommandList(command.trim());
	const outputs: string[] = [];
	let lastFailed = false;

	for (let i = 0; i < list.length; i++) {
		const entry = list[i]!;
		const prevOperator = i > 0 ? list[i - 1]!.operator : null;

		// Decide whether to skip based on the previous operator
		if (prevOperator === "&&" && lastFailed) {
			// AND-chain failed — propagate the error at the end
			break;
		}
		if (prevOperator === "||" && !lastFailed) {
			// OR-chain succeeded — skip the fallback
			continue;
		}

		try {
			const out = await executePipeline(entry.pipeline, ctx);
			if (out) outputs.push(out);
			lastFailed = false;
		} catch (e) {
			lastFailed = true;
			// ; always continues; && and || need to look at the next entry.
			// If this is the last entry (or next is &&), re-throw so the caller sees the error.
			const nextOperator = entry.operator;
			if (nextOperator === null || nextOperator === "&&") {
				throw e;
			}
			// For ||: swallow and let the next entry run as the fallback.
		}
	}

	return outputs.join("\n");
}

/**
 * Execute a single {@link ParsedPipeline} and return its stdout string.
 * Handles input redirection, the pipe chain, and output redirection.
 */
async function executePipeline(
	pipeline: import("./parser.js").ParsedPipeline,
	ctx: ShellContext,
): Promise<string> {
	// Handle input redirection: read file content as initial stdin
	let stdin: string | null = null;
	if (pipeline.inputRedirect) {
		const { root, key } = resolveShellPath(
			ctx.roots,
			pipeline.inputRedirect.path,
			ctx.cwd,
		);
		const buf = await ctx.vfs.get(root, key);
		stdin = buf.toString("utf8");
	}

	// Execute pipeline stages sequentially
	let output = stdin;
	for (const stage of pipeline.stages) {
		const handler = COMMANDS.get(stage.command);
		if (!handler) {
			throw new Error(`shell: command not found — ${stage.command}`);
		}
		output = await handler(stage.args, ctx, output);
	}

	const result = output ?? "";

	// Handle output redirection
	if (pipeline.outputRedirect) {
		const redirect = pipeline.outputRedirect;
		const { root, key } = resolveShellPath(ctx.roots, redirect.path, ctx.cwd);

		if (redirect.mode === "append") {
			let existing = "";
			try {
				const buf = await ctx.vfs.get(root, key);
				existing = buf.toString("utf8");
			} catch {
				// File doesn't exist — start empty
			}
			await ctx.vfs.put(root, key, Buffer.from(existing + result, "utf8"));
		} else {
			await ctx.vfs.put(root, key, Buffer.from(result, "utf8"));
		}
		// Redirected output is consumed — return empty
		return "";
	}

	return result;
}

/**
 * MCP tool handler for the `shell` tool.
 */
export async function handleShell(
	args: { command: string },
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const shellCtx: ShellContext = {
			vfs: ctx.vfs,
			roots: ctx.roots,
			enableDelete: ctx.enableDelete,
		};
		const result = await executeShell(args.command, shellCtx);
		return ok(result);
	} catch (e) {
		return err((e as Error).message);
	}
}

/**
 * Register the `shell` MCP tool on the server.
 * Only call when `enableShell` is true.
 */
export function registerShellTool(server: McpServer, ctx: Ctx): void {
	const supportedCmds = [...COMMANDS.keys()].join(", ");

	server.registerTool(
		"shell",
		{
			description:
				"Execute POSIX-like shell commands against the cloud filesystem. " +
				"Supports pipes (|), input redirection (<), output redirection (>, >>), " +
				"and command list operators (&& for AND-chaining, || for OR-fallback, ; for sequencing). " +
				"All paths must be cloud URIs (e.g. s3://bucket/key). " +
				"No real shell is spawned — commands run in-process against the VFS. " +
				`Supported commands: ${supportedCmds}. ` +
				"Destructive commands (rm, mv) require --enable-delete.",
			inputSchema: z.object({
				command: z
					.string()
					.describe(
						'A shell command string, e.g. "ls -l s3://bucket/path" or "cat s3://b/f.txt | grep pattern | wc -l"',
					),
			}),
		},
		async (args) => handleShell(args, ctx),
	);
}
