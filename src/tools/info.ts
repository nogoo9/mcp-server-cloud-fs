// src/tools/info.ts

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

export async function handleGetFileInfo(
	args: { path: string },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const info = await ctx.vfs.stat(root, key);
		const lines = [
			`Path:          ${args.path}`,
			`Size:          ${info.size} bytes`,
			`Last modified: ${info.lastModified.toISOString()}`,
			...(info.contentType !== undefined
				? [`Content-Type:  ${info.contentType}`]
				: []),
		];
		return { content: [{ type: "text", text: lines.join("\n") }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleListAllowedDirectories(
	_args: Record<string, never>,
	ctx: Ctx,
): Promise<ToolResult> {
	return {
		content: [{ type: "text", text: ctx.roots.map((r) => r.uri).join("\n") }],
	};
}

export function registerInfoTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"get_file_info",
		{
			description:
				"Get metadata for a file: size, last modified, content type.",
			inputSchema: z.object({ path: z.string() }),
		},
		async (args) => handleGetFileInfo(args, ctx),
	);

	server.registerTool(
		"list_allowed_directories",
		{
			description:
				"Return the list of allowed root URIs configured for this server.",
			inputSchema: z.object({}),
		},
		async (args) => handleListAllowedDirectories(args, ctx),
	);
}
