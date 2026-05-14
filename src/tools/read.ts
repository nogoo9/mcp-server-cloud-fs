// src/tools/read.ts

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { ParsedRoot } from "../providers/interface.js";
import type { VirtualFS } from "../vfs.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
};
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
type ToolResult = {
	content: (TextContent | ImageContent)[];
	isError?: boolean;
};

async function readWithVfs(
	path: string,
	ctx: Ctx,
): Promise<{
	buffer: Buffer;
	root: ReturnType<typeof resolveToolPath>["root"];
	key: string;
}> {
	const { root, key } = resolveToolPath(ctx.roots, path);
	const buffer = await ctx.vfs.get(root, key);
	return { buffer, root, key };
}

const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB safety cap

export async function handleReadTextFile(
	args: { path: string; head?: number | undefined; tail?: number | undefined },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { buffer } = await readWithVfs(args.path, ctx);
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
		const { buffer, key } = await readWithVfs(args.path, ctx);
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
			const { buffer } = await readWithVfs(path, ctx);
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

export async function handleReadFileChunk(
	args: {
		path: string;
		start_byte: number;
		end_byte?: number | undefined;
		encoding: "utf8" | "base64";
	},
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const stat = await ctx.vfs.stat(root, key);
		const totalSize = stat.size;
		const startByte = args.start_byte;
		const endByte =
			args.end_byte !== undefined
				? Math.min(args.end_byte, totalSize - 1)
				: totalSize - 1;

		if (startByte >= totalSize) {
			return {
				content: [
					{
						type: "text",
						text: `start_byte (${startByte}) is at or past end of file (${totalSize} bytes).`,
					},
				],
				isError: true,
			};
		}

		const chunkSize = endByte - startByte + 1;
		if (chunkSize > MAX_CHUNK_SIZE) {
			return {
				content: [
					{
						type: "text",
						text: `Requested chunk size (${chunkSize} bytes) exceeds maximum (${MAX_CHUNK_SIZE} bytes). Use a smaller range.`,
					},
				],
				isError: true,
			};
		}

		const buffer = await ctx.vfs.get(root, key, { startByte, endByte });
		const encoded =
			args.encoding === "base64"
				? buffer.toString("base64")
				: buffer.toString("utf8");

		const header = `Bytes ${startByte}–${endByte} of ${totalSize} total (${buffer.length} bytes returned):\n\n`;
		return { content: [{ type: "text", text: header + encoded }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
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

	server.registerTool(
		"read_file_chunk",
		{
			description:
				"Read a byte range from a file without downloading the entire object. " +
				"Uses the cloud provider's native byte-range support for efficient partial reads. " +
				"Returns file size metadata alongside the content.",
			inputSchema: z.object({
				path: z.string(),
				start_byte: z
					.number()
					.int()
					.nonnegative()
					.describe("Starting byte offset (0-based, inclusive)"),
				end_byte: z
					.number()
					.int()
					.nonnegative()
					.optional()
					.describe(
						"Ending byte offset (inclusive). Omit to read to end of file.",
					),
				encoding: z
					.enum(["utf8", "base64"])
					.default("utf8")
					.describe("Output encoding: 'utf8' for text, 'base64' for binary."),
			}),
		},
		async (args) => handleReadFileChunk(args, ctx),
	);
}
