// src/tools/write.ts

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { ParsedRoot } from "../providers/interface.js";
import type { VirtualFS } from "../vfs.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
};
type ToolResult = {
	content: [{ type: "text"; text: string }];
	isError?: boolean;
};

export async function handleWriteFile(
	args: { path: string; content: string },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const buffer = Buffer.from(args.content, "utf8");
		await ctx.vfs.put(root, key, buffer);
		return {
			content: [{ type: "text", text: `Successfully wrote to ${args.path}` }],
		};
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleEditFile(
	args: {
		path: string;
		edits: Array<{ oldText: string; newText: string }>;
		dryRun?: boolean | undefined;
	},
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		// Read via VFS (cache-first, then provider)
		const buffer = await ctx.vfs.get(root, key);
		const original = buffer.toString("utf8");
		let content = original;

		// Apply edits sequentially
		for (const { oldText, newText } of args.edits) {
			if (!content.includes(oldText)) {
				throw new Error(
					`edit_file: oldText not found in ${args.path}: ${JSON.stringify(oldText.slice(0, 40))}`,
				);
			}
			content = content.replace(oldText, newText);
		}

		if (args.dryRun) {
			return {
				content: [
					{ type: "text", text: formatDiff(args.path, args.edits, original) },
				],
			};
		}

		const newBuffer = Buffer.from(content, "utf8");
		await ctx.vfs.put(root, key, newBuffer);
		return {
			content: [{ type: "text", text: `Successfully edited ${args.path}` }],
		};
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

function formatDiff(
	path: string,
	edits: Array<{ oldText: string; newText: string }>,
	original: string,
): string {
	let out = `Dry run — edits to ${path}:\n\n`;
	for (let i = 0; i < edits.length; i++) {
		const { oldText, newText } = edits[i]!;
		const found = original.includes(oldText);
		out += `Edit ${i + 1}${found ? "" : " (NOT FOUND — would error)"}:\n`;
		for (const line of oldText.split("\n")) out += `- ${line}\n`;
		for (const line of newText.split("\n")) out += `+ ${line}\n`;
		out += "\n";
	}
	return out.trimEnd();
}

export function registerWriteTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"write_file",
		{
			description: "Write content to a file, creating it if it does not exist.",
			inputSchema: z.object({ path: z.string(), content: z.string() }),
		},
		async (args) => handleWriteFile(args, ctx),
	);

	server.registerTool(
		"edit_file",
		{
			description:
				"Apply text edits to a file. Each edit replaces oldText with newText. Use dryRun to preview.",
			inputSchema: z.object({
				path: z.string(),
				edits: z.array(z.object({ oldText: z.string(), newText: z.string() })),
				dryRun: z.boolean().optional(),
			}),
		},
		async (args) => handleEditFile(args, ctx),
	);
}
