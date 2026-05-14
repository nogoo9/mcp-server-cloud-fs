// src/tools/presigned.ts
// Tool for generating presigned (temporary) download/upload URLs.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import type { VirtualFS } from "../vfs.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	provider: StorageProvider;
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

/** Maximum presigned URL validity: 24 hours. */
const MAX_EXPIRES_IN = 86_400;

export async function handleGetPresignedUrl(
	args: {
		path: string;
		expires_in: number;
		operation: "get" | "put";
	},
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		if (!ctx.provider.getPresignedUrl) {
			return err(
				"Presigned URLs are not supported by this storage provider. " +
					"This feature is available for S3, Azure, and GCS providers.",
			);
		}

		const expiresIn = Math.min(args.expires_in, MAX_EXPIRES_IN);
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		const url = await ctx.provider.getPresignedUrl(root, key, {
			expiresIn,
			operation: args.operation,
		});

		const minutes = Math.round(expiresIn / 60);
		const action = args.operation === "put" ? "upload" : "download";
		return ok(
			`Presigned ${action} URL for ${args.path} (valid for ${minutes} minutes):\n\n${url}`,
		);
	} catch (e) {
		return err((e as Error).message);
	}
}

export function registerPresignedTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"get_presigned_url",
		{
			description:
				"Generate a temporary, authenticated HTTPS URL for a cloud object. " +
				"The URL grants time-limited access without exposing credentials. " +
				"Use 'get' for download URLs, 'put' for upload URLs. " +
				"Maximum validity is 24 hours (86400 seconds). " +
				"Supported providers: S3, Azure, GCS.",
			inputSchema: z.object({
				path: z.string().describe("Path to the cloud object"),
				expires_in: z
					.number()
					.int()
					.positive()
					.default(600)
					.describe(
						"URL validity in seconds (default: 600 = 10 minutes, max: 86400 = 24h)",
					),
				operation: z
					.enum(["get", "put"])
					.default("get")
					.describe("'get' for download URLs, 'put' for upload URLs"),
			}),
		},
		async (args) => handleGetPresignedUrl(args, ctx),
	);
}
