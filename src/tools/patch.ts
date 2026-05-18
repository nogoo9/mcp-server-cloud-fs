// src/tools/patch.ts
// Macro tool: patch_file — apply unified diffs or line-range replacements atomically.

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

function ok(text: string): ToolResult {
	return { content: [{ type: "text", text }] };
}

function err(text: string): ToolResult {
	return { isError: true, content: [{ type: "text", text }] };
}

// ── Unified diff parser ───────────────────────────────────────────────────

interface Hunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: string[];
}

export function parseUnifiedDiff(patch: string): Hunk[] {
	const hunks: Hunk[] = [];
	const lines = patch.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;

		// Skip file header lines (---, +++, diff, index)
		if (
			line.startsWith("---") ||
			line.startsWith("+++") ||
			line.startsWith("diff") ||
			line.startsWith("index")
		) {
			i++;
			continue;
		}

		// Parse hunk header
		const hunkMatch = line.match(
			/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/,
		);
		if (hunkMatch) {
			const oldStart = Number.parseInt(hunkMatch[1]!, 10);
			const oldCount =
				hunkMatch[2] !== undefined ? Number.parseInt(hunkMatch[2], 10) : 1;
			const newStart = Number.parseInt(hunkMatch[3]!, 10);
			const newCount =
				hunkMatch[4] !== undefined ? Number.parseInt(hunkMatch[4], 10) : 1;
			i++;

			const hunkLines: string[] = [];
			while (i < lines.length && !lines[i]!.startsWith("@@")) {
				const l = lines[i]!;
				if (
					l.startsWith(" ") ||
					l.startsWith("-") ||
					l.startsWith("+") ||
					l === ""
				) {
					hunkLines.push(l);
					i++;
				} else {
					break;
				}
			}

			hunks.push({
				oldStart,
				oldCount,
				newStart,
				newCount,
				lines: hunkLines,
			});
			continue;
		}

		i++;
	}

	return hunks;
}

export function applyUnifiedDiff(content: string, hunks: Hunk[]): string {
	const originalLines = content.split("\n");
	const result = [...originalLines];
	let offset = 0;

	// Hunks must be applied in order, adjusting line indices by accumulated offset
	for (const hunk of hunks) {
		const startIdx = hunk.oldStart - 1 + offset;
		const removals: number[] = [];
		const additions: string[] = [];

		let lineIdx = startIdx;
		for (const line of hunk.lines) {
			if (line.startsWith("-")) {
				removals.push(lineIdx);
				lineIdx++;
			} else if (line.startsWith("+")) {
				additions.push(line.slice(1));
			} else if (line.startsWith(" ") || line === "") {
				lineIdx++;
			}
		}

		// Remove lines in reverse order to preserve indices
		for (let r = removals.length - 1; r >= 0; r--) {
			result.splice(removals[r]!, 1);
		}

		// Insert additions at the start position (adjusted for removals)
		const insertAt = removals.length > 0 ? removals[0]! : startIdx;
		result.splice(insertAt, 0, ...additions);

		offset += additions.length - removals.length;
	}

	return result.join("\n");
}

// ── Line-replace parser ───────────────────────────────────────────────────

interface LineReplacement {
	startLine: number;
	endLine: number;
	replacement: string;
}

export function parseLineReplace(patch: string): LineReplacement[] {
	const blocks: LineReplacement[] = [];
	const lines = patch.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!.trim();
		// Format: startLine:endLine
		const match = line.match(/^(\d+):(\d+)$/);
		if (match) {
			const startLine = Number.parseInt(match[1]!, 10);
			const endLine = Number.parseInt(match[2]!, 10);
			i++;

			// Collect replacement lines until next block header or end
			const replacementLines: string[] = [];
			while (i < lines.length) {
				const nextLine = lines[i]!;
				if (/^\d+:\d+$/.test(nextLine.trim())) break;
				replacementLines.push(nextLine);
				i++;
			}

			// Remove trailing empty line if patch ends with newline
			if (
				replacementLines.length > 0 &&
				replacementLines[replacementLines.length - 1] === ""
			) {
				replacementLines.pop();
			}

			blocks.push({
				startLine,
				endLine,
				replacement: replacementLines.join("\n"),
			});
		} else {
			i++;
		}
	}

	return blocks;
}

export function applyLineReplace(
	content: string,
	replacements: LineReplacement[],
): string {
	const lines = content.split("\n");

	// Apply in reverse order to preserve line indices
	const sorted = [...replacements].sort((a, b) => b.startLine - a.startLine);
	for (const { startLine, endLine, replacement } of sorted) {
		const idx = startLine - 1; // 1-indexed → 0-indexed
		const count = endLine - startLine + 1;
		const newLines = replacement.split("\n");
		lines.splice(idx, count, ...newLines);
	}

	return lines.join("\n");
}

// ── Tool handler ──────────────────────────────────────────────────────────

export async function handlePatchFile(
	args: {
		path: string;
		patch: string;
		format?: "unified" | "line_replace" | undefined;
		expected_etag?: string | undefined;
	},
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const buffer = await ctx.vfs.get(root, key);
		const original = buffer.toString("utf8");
		const format = args.format ?? "unified";

		// Optimistic concurrency check
		if (args.expected_etag) {
			const stat = await ctx.vfs.stat(root, key);
			if (stat.etag && stat.etag !== args.expected_etag) {
				return err(
					`Conflict: file has been modified since last read. ` +
						`Expected etag: ${args.expected_etag}, current etag: ${stat.etag}. ` +
						`Re-read the file and retry.`,
				);
			}
		}

		let result: string;
		if (format === "unified") {
			const hunks = parseUnifiedDiff(args.patch);
			if (hunks.length === 0) {
				return err("No valid hunks found in unified diff");
			}
			result = applyUnifiedDiff(original, hunks);
		} else {
			const replacements = parseLineReplace(args.patch);
			if (replacements.length === 0) {
				return err("No valid line replacement blocks found");
			}
			result = applyLineReplace(original, replacements);
		}

		const originalLineCount = original.split("\n").length;
		const resultLineCount = result.split("\n").length;
		const lineDiff = resultLineCount - originalLineCount;
		const sign = lineDiff >= 0 ? "+" : "";

		await ctx.vfs.put(root, key, Buffer.from(result, "utf8"));
		const newStat = await ctx.vfs.stat(root, key);
		const etagInfo = newStat.etag ? ` (etag: ${newStat.etag})` : "";

		return ok(
			`Successfully patched ${args.path}: ${originalLineCount} → ${resultLineCount} lines (${sign}${lineDiff})${etagInfo}`,
		);
	} catch (e) {
		return err((e as Error).message);
	}
}

// ── Registration ──────────────────────────────────────────────────────────

export function registerPatchTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"patch_file",
		{
			description:
				"Apply a patch to a file atomically. Supports unified diff format " +
				"(standard @@ hunks) and line_replace format (startLine:endLine followed by replacement). " +
				"Combines read + transform + write in a single tool call. " +
				"Optionally pass expected_etag for concurrency safety.",
			inputSchema: z.object({
				path: z.string().describe("Path to the file to patch"),
				patch: z
					.string()
					.describe("The patch content (unified diff or line replacements)"),
				format: z
					.enum(["unified", "line_replace"])
					.optional()
					.describe('Patch format (default: "unified")'),
				expected_etag: z
					.string()
					.optional()
					.describe(
						"If provided, the patch is rejected when the current file etag does not match",
					),
			}),
		},
		async (args) => handlePatchFile(args, ctx),
	);
}
