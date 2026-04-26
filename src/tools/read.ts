// src/tools/read.ts

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
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
type ToolResult = {
	content: (TextContent | ImageContent)[];
	isError?: boolean;
};

async function readWithCache(
	path: string,
	ctx: Ctx,
): Promise<{
	buffer: Buffer;
	root: ReturnType<typeof resolveToolPath>["root"];
	key: string;
}> {
	const { root, key } = resolveToolPath(ctx.roots, path);
	const cacheKey = toCacheKey(root, key);
	let buffer = await ctx.cache.get(cacheKey);
	if (buffer === null) {
		buffer = await ctx.provider.getObject(root, key);
		await ctx.cache.set(cacheKey, buffer);
	}
	return { buffer, root, key };
}

export async function handleReadTextFile(
	args: { path: string; head?: number | undefined; tail?: number | undefined },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { buffer } = await readWithCache(args.path, ctx);
		const text = buffer.toString("utf8");
		if (args.head !== undefined) {
			return {
				content: [
					{
						type: "text",
						text: text.split("\n").slice(0, args.head).join("\n"),
					},
				],
			};
		}
		if (args.tail !== undefined) {
			const lines = text.split("\n");
			return {
				content: [
					{
						type: "text",
						text: lines.slice(Math.max(0, lines.length - args.tail)).join("\n"),
					},
				],
			};
		}
		return { content: [{ type: "text", text }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleReadMediaFile(
	args: { path: string },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { buffer, key } = await readWithCache(args.path, ctx);
		const mimeType = inferMimeType(key);
		return {
			content: [{ type: "image", data: buffer.toString("base64"), mimeType }],
		};
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleReadMultipleFiles(
	args: { paths: string[] },
	ctx: Ctx,
): Promise<ToolResult> {
	const results = await Promise.allSettled(
		args.paths.map(async (path) => {
			const { buffer } = await readWithCache(path, ctx);
			return `${path}:\n${buffer.toString("utf8")}`;
		}),
	);
	const content: TextContent[] = results.map((r, i) =>
		r.status === "fulfilled"
			? { type: "text", text: r.value }
			: {
					type: "text",
					text: `${args.paths[i]!}:\nError: ${(r.reason as Error).message}`,
				},
	);
	return { content };
}

function inferMimeType(key: string): string {
	const ext = key.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		pdf: "application/pdf",
	};
	return map[ext] ?? "application/octet-stream";
}

export function registerReadTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"read_file",
		{
			description:
				"Read the complete contents of a file (UTF-8). Deprecated alias for read_text_file.",
			inputSchema: z.object({ path: z.string() }),
		},
		async (args) => handleReadTextFile(args, ctx),
	);

	server.registerTool(
		"read_text_file",
		{
			description:
				"Read a text file. Optionally read only the first `head` or last `tail` lines.",
			inputSchema: z.object({
				path: z.string(),
				head: z.number().int().positive().optional(),
				tail: z.number().int().positive().optional(),
			}),
		},
		async (args) => handleReadTextFile(args, ctx),
	);

	server.registerTool(
		"read_media_file",
		{
			description:
				"Read a binary/media file and return its base64-encoded contents.",
			inputSchema: z.object({ path: z.string() }),
		},
		async (args) => handleReadMediaFile(args, ctx),
	);

	server.registerTool(
		"read_multiple_files",
		{
			description:
				"Read multiple files. Returns per-file results; individual errors do not fail the call.",
			inputSchema: z.object({ paths: z.array(z.string()) }),
		},
		async (args) => handleReadMultipleFiles(args, ctx),
	);
}
