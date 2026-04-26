// src/tools/move.ts

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CacheStore } from "../cache/interface.js";
import { resolveToolPath, toCacheKey } from "../path-utils.js";
import type { ParsedRoot, StorageProvider } from "../providers/interface.js";

type Ctx = {
	provider: StorageProvider;
	cache: CacheStore;
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

		if (srcRoot.bucket === dstRoot.bucket) {
			await ctx.provider.copyObject(srcRoot, srcKey, dstKey);
			await ctx.cache.delete(toCacheKey(dstRoot, dstKey));
		} else {
			const buffer = await ctx.provider.getObject(srcRoot, srcKey);
			const dstCacheKey = toCacheKey(dstRoot, dstKey);
			await ctx.cache.set(dstCacheKey, buffer);
			ctx.cache.markDirty(dstCacheKey, dstRoot, dstKey);
		}

		await ctx.provider.deleteObject(srcRoot, srcKey);
		await ctx.cache.delete(toCacheKey(srcRoot, srcKey));

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
