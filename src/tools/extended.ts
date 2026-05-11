// src/tools/extended.ts
// Extended tools inspired by claude-code's filesystem tool surface.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { minimatch } from "minimatch";
import { z } from "zod";
import { resolveToolPath, toCacheKey } from "../path-utils.js";
import type { ParsedRoot } from "../providers/interface.js";
import type { VirtualFS } from "../vfs.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	enableDelete?: boolean;
	grepMaxObjects?: number;
};

type TextToolResult = {
	content: [{ type: "text"; text: string }];
	isError?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string): TextToolResult {
	return { content: [{ type: "text", text }] };
}

function err(text: string): TextToolResult {
	return { isError: true, content: [{ type: "text", text }] };
}

// ---------------------------------------------------------------------------
// read_file_range
// ---------------------------------------------------------------------------

export async function handleReadFileRange(
	args: { path: string; offset: number; limit: number },
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const buffer = await ctx.vfs.get(root, key);
		const lines = buffer.toString("utf8").split("\n");
		const totalLines = lines.length;
		// offset is 1-based (following claude-code FileReadTool convention)
		const startIdx = Math.max(0, args.offset - 1);
		const slice = lines.slice(startIdx, startIdx + args.limit);
		const text = slice.join("\n");
		const note =
			`Lines ${args.offset}–${Math.min(args.offset + args.limit - 1, totalLines)} ` +
			`of ${totalLines} total:\n\n${text}`;
		return ok(note);
	} catch (e) {
		return err((e as Error).message);
	}
}

// ---------------------------------------------------------------------------
// grep_file
// ---------------------------------------------------------------------------

export async function handleGrepFile(
	args: {
		path: string;
		pattern: string;
		case_insensitive?: boolean | undefined;
	},
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const buffer = await ctx.vfs.get(root, key);
		const flags = args.case_insensitive ? "i" : "";
		const re = new RegExp(args.pattern, flags);
		const lines = buffer.toString("utf8").split("\n");
		const matches = lines
			.map((line, i) => ({ line, n: i + 1 }))
			.filter(({ line }) => re.test(line))
			.map(({ line, n }) => `${n}:${line}`);
		if (matches.length === 0) {
			return ok(`No matches found for pattern: ${args.pattern}`);
		}
		return ok(matches.join("\n"));
	} catch (e) {
		return err((e as Error).message);
	}
}

// ---------------------------------------------------------------------------
// grep_files
// ---------------------------------------------------------------------------

export async function handleGrepFiles(
	args: {
		path: string;
		pattern: string;
		glob?: string | undefined;
		case_insensitive?: boolean | undefined;
		output_mode?: "files_with_matches" | "content" | undefined;
		max_objects?: number | undefined;
	},
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const prefix = key ? `${key}/` : "";
		const { objects } = await ctx.vfs.list(root, prefix);

		const maxObjects = args.max_objects ?? ctx.grepMaxObjects ?? 1000;
		const flags = args.case_insensitive ? "i" : "";
		const re = new RegExp(args.pattern, flags);

		// Filter by glob if provided
		let candidates = objects.filter((o) => !o.key.endsWith("/"));
		if (args.glob) {
			candidates = candidates.filter((o) =>
				minimatch(o.key, args.glob!, { dot: true }),
			);
		}

		// Cap to maxObjects
		const capped = candidates.slice(0, maxObjects);
		const truncated = candidates.length > maxObjects;

		const outputMode = args.output_mode ?? "files_with_matches";

		if (outputMode === "files_with_matches") {
			const matchingPaths: string[] = [];
			await Promise.allSettled(
				capped.map(async (obj) => {
					try {
						const buf = await ctx.vfs.get(root, obj.key);
						const text = buf.toString("utf8");
						if (re.test(text)) {
							matchingPaths.push(`${root.scheme}://${root.bucket}/${obj.key}`);
						}
					} catch {
						// skip unreadable objects
					}
				}),
			);

			if (matchingPaths.length === 0) {
				return ok(`No files matched pattern: ${args.pattern}`);
			}
			const suffix = truncated
				? `\n\n(Results capped at ${maxObjects} objects scanned. Use max_objects to increase.)`
				: "";
			return ok(matchingPaths.sort().join("\n") + suffix);
		}

		// content mode — return matching lines with file:lineNo: prefix
		const contentLines: string[] = [];
		await Promise.allSettled(
			capped.map(async (obj) => {
				try {
					const buf = await ctx.vfs.get(root, obj.key);
					const lines = buf.toString("utf8").split("\n");
					for (let i = 0; i < lines.length; i++) {
						if (re.test(lines[i]!)) {
							const uri = `${root.scheme}://${root.bucket}/${obj.key}`;
							contentLines.push(`${uri}:${i + 1}:${lines[i]}`);
						}
					}
				} catch {
					// skip unreadable objects
				}
			}),
		);

		if (contentLines.length === 0) {
			return ok(`No content matched pattern: ${args.pattern}`);
		}
		const suffix = truncated
			? `\n\n(Results capped at ${maxObjects} objects scanned. Use max_objects to increase.)`
			: "";
		return ok(contentLines.sort().join("\n") + suffix);
	} catch (e) {
		return err((e as Error).message);
	}
}

// ---------------------------------------------------------------------------
// copy_file
// ---------------------------------------------------------------------------

export async function handleCopyFile(
	args: { source: string; destination: string },
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root: srcRoot, key: srcKey } = resolveToolPath(
			ctx.roots,
			args.source,
		);
		const { root: dstRoot, key: dstKey } = resolveToolPath(
			ctx.roots,
			args.destination,
		);

		await ctx.vfs.copy(srcRoot, srcKey, dstRoot, dstKey);

		return ok(`Successfully copied ${args.source} to ${args.destination}`);
	} catch (e) {
		return err((e as Error).message);
	}
}

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

export async function handleDeleteFile(
	args: { path: string },
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		await ctx.vfs.remove(root, key);
		return ok(`Successfully deleted ${args.path}`);
	} catch (e) {
		return err((e as Error).message);
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerExtendedTools(server: McpServer, ctx: Ctx): void {
	// ── read_file_range ──────────────────────────────────────────────────────
	server.registerTool(
		"read_file_range",
		{
			description:
				"Read a slice of a text file by line range. " +
				"offset is 1-based (offset=1 means the first line). " +
				"Returns the requested lines together with a header showing the range and total line count.",
			inputSchema: z.object({
				path: z.string(),
				offset: z
					.number()
					.int()
					.positive()
					.describe(
						"1-based line number to start reading from (line 1 = first line of the file)",
					),
				limit: z
					.number()
					.int()
					.positive()
					.describe("Number of lines to return"),
			}),
		},
		async (args) => handleReadFileRange(args, ctx),
	);

	// ── grep_file ─────────────────────────────────────────────────────────────
	server.registerTool(
		"grep_file",
		{
			description:
				"Search a single file for lines matching a regular expression. " +
				"Returns matching lines prefixed with their 1-based line number (e.g. '42:matched line').",
			inputSchema: z.object({
				path: z.string(),
				pattern: z
					.string()
					.describe("Regular expression pattern to search for"),
				case_insensitive: z
					.boolean()
					.optional()
					.describe("Case-insensitive matching (default: false)"),
			}),
		},
		async (args) => handleGrepFile(args, ctx),
	);

	// ── grep_files ────────────────────────────────────────────────────────────
	server.registerTool(
		"grep_files",
		{
			description:
				"Search all objects under a path for a regular expression. " +
				"output_mode 'files_with_matches' (default) returns URIs of matching files; " +
				"'content' returns matching lines prefixed with 'uri:lineNo:'. " +
				`Scans at most max_objects objects per call (server default: ${ctx.grepMaxObjects ?? 1000}).`,
			inputSchema: z.object({
				path: z.string(),
				pattern: z
					.string()
					.describe("Regular expression pattern to search for"),
				glob: z
					.string()
					.optional()
					.describe(
						"Glob filter applied to object keys before searching (e.g. '*.json')",
					),
				case_insensitive: z.boolean().optional(),
				output_mode: z
					.enum(["files_with_matches", "content"])
					.optional()
					.describe(
						"'files_with_matches' (default) — return URIs of matching files; " +
							"'content' — return matching lines with location prefix",
					),
				max_objects: z
					.number()
					.int()
					.positive()
					.optional()
					.describe(
						"Override the maximum number of objects to scan for this call",
					),
			}),
		},
		async (args) => handleGrepFiles(args, ctx),
	);

	// ── copy_file ─────────────────────────────────────────────────────────────
	server.registerTool(
		"copy_file",
		{
			description:
				"Copy a file from source to destination. " +
				"Same-bucket copies use a server-side copy (efficient). " +
				"Cross-bucket copies download then re-upload the content.",
			inputSchema: z.object({
				source: z.string(),
				destination: z.string(),
			}),
		},
		async (args) => handleCopyFile(args, ctx),
	);

	// ── delete_file (opt-in) ──────────────────────────────────────────────────
	if (ctx.enableDelete) {
		server.registerTool(
			"delete_file",
			{
				description:
					"Permanently delete a file. " +
					"This tool is only available when the server is started with --enable-delete.",
				inputSchema: z.object({ path: z.string() }),
			},
			async (args) => handleDeleteFile(args, ctx),
		);
	}
}
