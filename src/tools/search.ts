// src/tools/search.ts

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { minimatch } from "minimatch";
import { z } from "zod";
import type { CacheStore } from "../cache/interface.js";
import { resolveToolPath } from "../path-utils.js";
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

export async function handleSearchFiles(
	args: {
		path: string;
		pattern: string;
		excludePatterns?: string[] | undefined;
	},
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const prefix = key ? `${key}/` : "";
		const { objects } = await ctx.provider.listObjects(root, prefix);
		const exclude = args.excludePatterns ?? [];

		const matches = objects
			.map((o) => o.key)
			.filter((k) => minimatch(k, args.pattern, { dot: true }))
			.filter((k) => !exclude.some((p) => minimatch(k, p, { dot: true })));

		if (matches.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: `No matches found for pattern: ${args.pattern}`,
					},
				],
			};
		}
		return { content: [{ type: "text", text: matches.join("\n") }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export function registerSearchTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"search_files",
		{
			description:
				"Search for files matching a glob pattern under a path. Supports excludePatterns.",
			inputSchema: z.object({
				path: z.string(),
				pattern: z.string(),
				excludePatterns: z.array(z.string()).optional(),
			}),
		},
		async (args) => handleSearchFiles(args, ctx),
	);
}
