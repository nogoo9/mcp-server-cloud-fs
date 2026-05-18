// src/tools/ai-native.ts
// AI-native tools: get_file_schema and summarize_file.
// Reduce LLM cognitive load by extracting structural metadata server-side.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { ParsedRoot } from "../providers/interface.js";
import type { VirtualFS } from "../vfs.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
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

// ── CSV schema detection ──────────────────────────────────────────────────

function inferCsvType(value: string): string {
	const trimmed = value.trim();
	if (trimmed === "") return "string";
	if (trimmed === "true" || trimmed === "false") return "boolean";
	if (/^-?\d+$/.test(trimmed)) return "integer";
	if (/^-?\d+\.\d+$/.test(trimmed)) return "number";
	if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return "date";
	return "string";
}

function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++; // skip escaped quote
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			fields.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	fields.push(current);
	return fields;
}

interface CsvSchema {
	format: "csv";
	columns: Array<{ name: string; inferredType: string; sample: string }>;
	columnCount: number;
	rowCount: number;
}

function detectCsvSchema(text: string): CsvSchema {
	const lines = text.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length === 0) {
		return { format: "csv", columns: [], columnCount: 0, rowCount: 0 };
	}

	const headers = parseCsvLine(lines[0]!);
	const sampleRows = lines.slice(1, 6).map(parseCsvLine);
	const dataRowCount = lines.length - 1;

	const columns = headers.map((name, i) => {
		const sampleValues = sampleRows
			.map((row) => row[i] ?? "")
			.filter((v) => v.trim().length > 0);
		const types = sampleValues.map(inferCsvType);
		const dominantType =
			types.length > 0
				? types.reduce((a, b) =>
						types.filter((t) => t === a).length >=
						types.filter((t) => t === b).length
							? a
							: b,
					)
				: "string";
		return {
			name: name.trim(),
			inferredType: dominantType,
			sample: sampleValues[0] ?? "",
		};
	});

	return {
		format: "csv",
		columns,
		columnCount: headers.length,
		rowCount: dataRowCount,
	};
}

// ── JSON schema detection ─────────────────────────────────────────────────

interface JsonSchema {
	format: "json";
	rootType: "object" | "array" | "primitive";
	keys?: string[];
	elementCount?: number;
	shape?: Record<string, string>;
}

function detectJsonSchema(text: string): JsonSchema {
	const parsed = JSON.parse(text);

	if (Array.isArray(parsed)) {
		const schema: JsonSchema = {
			format: "json",
			rootType: "array",
			elementCount: parsed.length,
		};
		if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0]) {
			schema.shape = {};
			for (const [k, v] of Object.entries(parsed[0])) {
				schema.shape[k] = Array.isArray(v) ? "array" : typeof v;
			}
		}
		return schema;
	}

	if (typeof parsed === "object" && parsed !== null) {
		const shape: Record<string, string> = {};
		for (const [k, v] of Object.entries(parsed)) {
			shape[k] = Array.isArray(v) ? "array" : typeof v;
		}
		return {
			format: "json",
			rootType: "object",
			keys: Object.keys(parsed),
			shape,
		};
	}

	return { format: "json", rootType: "primitive" };
}

// ── Tool handlers ─────────────────────────────────────────────────────────

export async function handleGetFileSchema(
	args: { path: string },
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const stat = await ctx.vfs.stat(root, key);
		const buffer = await ctx.vfs.get(root, key);
		const text = buffer.toString("utf8");
		const ext = key.split(".").pop()?.toLowerCase() ?? "";

		if (ext === "csv" || ext === "tsv") {
			const schema = detectCsvSchema(text);
			return ok(JSON.stringify(schema, null, 2));
		}

		if (ext === "json" || ext === "jsonl") {
			try {
				const schema = detectJsonSchema(text);
				return ok(JSON.stringify(schema, null, 2));
			} catch {
				return ok(
					JSON.stringify(
						{
							format: "json",
							error: "Invalid JSON",
							size: stat.size,
						},
						null,
						2,
					),
				);
			}
		}

		// Generic text file
		const lines = text.split("\n");
		return ok(
			JSON.stringify(
				{
					format: "text",
					lineCount: lines.length,
					size: stat.size,
					contentType: stat.contentType ?? "text/plain",
				},
				null,
				2,
			),
		);
	} catch (e) {
		return err((e as Error).message);
	}
}

export async function handleSummarizeFile(
	args: { path: string; max_lines?: number | undefined },
	ctx: Ctx,
): Promise<TextToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const stat = await ctx.vfs.stat(root, key);
		const ext = key.split(".").pop()?.toLowerCase() ?? "";
		const maxLines = args.max_lines ?? 20;

		const buffer = await ctx.vfs.get(root, key);
		const text = buffer.toString("utf8");
		const lines = text.split("\n");

		const headLines = lines.slice(0, maxLines);
		const tailLines = lines.length > maxLines + 5 ? lines.slice(-5) : undefined;

		const summary: Record<string, unknown> = {
			path: args.path,
			size: stat.size,
			lineCount: lines.length,
			extension: ext || undefined,
			contentType: stat.contentType ?? "text/plain",
			head: headLines.join("\n"),
		};

		if (tailLines) {
			summary.tail = tailLines.join("\n");
			summary.truncated = true;
		}

		return ok(JSON.stringify(summary, null, 2));
	} catch (e) {
		return err((e as Error).message);
	}
}

// ── Registration ──────────────────────────────────────────────────────────

export function registerAiNativeTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"get_file_schema",
		{
			description:
				"Extract structural schema from a file without returning its full contents. " +
				"For CSV: returns column names, inferred types, sample values, and row count. " +
				"For JSON: returns root type, keys, element count, and value shapes. " +
				"For other text: returns line count and size. " +
				"Use this before reading a file to understand its structure.",
			inputSchema: z.object({
				path: z.string().describe("Path to the file to analyze"),
			}),
		},
		async (args) => handleGetFileSchema(args, ctx),
	);

	server.registerTool(
		"summarize_file",
		{
			description:
				"Get a compact summary of a file: size, line count, content type, " +
				"first N lines (head), and last 5 lines (tail). " +
				"Use this to quickly understand a file without loading it entirely.",
			inputSchema: z.object({
				path: z.string().describe("Path to the file to summarize"),
				max_lines: z
					.number()
					.int()
					.positive()
					.optional()
					.describe("Maximum number of head lines to include (default: 20)"),
			}),
		},
		async (args) => handleSummarizeFile(args, ctx),
	);
}
