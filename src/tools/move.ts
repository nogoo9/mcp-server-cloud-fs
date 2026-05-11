// src/tools/move.ts

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

export async function handleMoveFile(
	args: { source: string; destination: string },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root: srcRoot, key: srcKey } = resolveToolPath(
			ctx.roots,
			args.source,
		);
		const { root: dstRoot, key: dstKey } = resolveToolPath(
			ctx.roots,
			args.destination,
		);

		// Copy then remove source
		await ctx.vfs.copy(srcRoot, srcKey, dstRoot, dstKey);
		await ctx.vfs.remove(srcRoot, srcKey);

		return {
			content: [
				{
					type: "text",
					text: `Successfully moved ${args.source} to ${args.destination}`,
				},
			],
		};
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export function registerMoveTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"move_file",
		{
			description:
				"Move a file from source to destination. Both paths must be within allowed roots.",
			inputSchema: z.object({ source: z.string(), destination: z.string() }),
		},
		async (args) => handleMoveFile(args, ctx),
	);
}
