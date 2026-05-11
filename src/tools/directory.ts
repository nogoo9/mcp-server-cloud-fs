// src/tools/directory.ts

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { minimatch } from "minimatch";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { ObjectInfo, ParsedRoot } from "../providers/interface.js";
import type { VirtualFS } from "../vfs.js";

type Ctx = {
	vfs: VirtualFS;
	roots: ParsedRoot[];
};
type ToolResult = {
	content: [{ type: "text"; text: string }];
	isError?: boolean;
};

export async function handleCreateDirectory(
	args: { path: string },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const prefix = key.endsWith("/") ? key : `${key}/`;
		await ctx.vfs.createPrefix(root, prefix);
		return {
			content: [
				{ type: "text", text: `Successfully created directory ${args.path}` },
			],
		};
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleListDirectory(
	args: { path: string },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const prefix = key ? `${key}/` : "";
		const { objects, prefixes } = await ctx.vfs.list(root, prefix, "/");
		const lines: string[] = [
			...prefixes.map((p) => `[DIR] ${p}`),
			...objects
				.filter((o) => !o.key.endsWith("/"))
				.map((o) => `[FILE] ${o.key}`),
		];
		return { content: [{ type: "text", text: lines.join("\n") }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleListDirectoryWithSizes(
	args: { path: string; sortBy?: "name" | "size" | undefined },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const prefix = key ? `${key}/` : "";
		const { objects, prefixes } = await ctx.vfs.list(root, prefix, "/");
		const sortBy = args.sortBy ?? "name";
		const sorted = [...objects]
			.filter((o) => !o.key.endsWith("/"))
			.sort((a, b) =>
				sortBy === "size" ? b.size - a.size : a.key.localeCompare(b.key),
			);
		const lines: string[] = [
			...prefixes.map((p) => `[DIR]  ${p}`),
			...sorted.map((o) => `[FILE] ${o.key.padEnd(60)} ${o.size} bytes`),
		];
		return { content: [{ type: "text", text: lines.join("\n") }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

export async function handleDirectoryTree(
	args: { path: string; excludePatterns?: string[] | undefined },
	ctx: Ctx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);
		const prefix = key ? `${key}/` : "";
		const { objects } = await ctx.vfs.list(root, prefix);
		const exclude = args.excludePatterns ?? [];
		const filtered = objects.filter(
			(o) =>
				!exclude.some((pattern) => minimatch(o.key, pattern, { dot: true })),
		);
		const tree = buildTree(filtered);
		const text = renderTree(tree, "");
		return { content: [{ type: "text", text }] };
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: (err as Error).message }],
		};
	}
}

type TreeNode = {
	name: string;
	children: Map<string, TreeNode>;
	isFile: boolean;
};

function buildTree(objects: ObjectInfo[]): Map<string, TreeNode> {
	const root = new Map<string, TreeNode>();
	for (const obj of objects) {
		const parts = obj.key.split("/");
		let current = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			if (part === "") continue;
			if (!current.has(part)) {
				current.set(part, {
					name: part,
					children: new Map(),
					isFile: i === parts.length - 1,
				});
			}
			current = current.get(part)!.children;
		}
	}
	return root;
}

function renderTree(nodes: Map<string, TreeNode>, indent: string): string {
	const lines: string[] = [];
	const entries = [...nodes.entries()];
	for (let i = 0; i < entries.length; i++) {
		const [, node] = entries[i]!;
		const isLast = i === entries.length - 1;
		lines.push(`${indent}${isLast ? "└── " : "├── "}${node.name}`);
		if (!node.isFile && node.children.size > 0) {
			const childText = renderTree(
				node.children,
				indent + (isLast ? "    " : "│   "),
			);
			if (childText) lines.push(childText);
		}
	}
	return lines.join("\n");
}

export function registerDirectoryTools(server: McpServer, ctx: Ctx): void {
	server.registerTool(
		"create_directory",
		{
			description:
				"Create a directory (writes a zero-byte trailing-slash object).",
			inputSchema: z.object({ path: z.string() }),
		},
		async (args) => handleCreateDirectory(args, ctx),
	);

	server.registerTool(
		"list_directory",
		{
			description:
				"List directory contents. Returns [FILE] and [DIR] prefixed entries.",
			inputSchema: z.object({ path: z.string() }),
		},
		async (args) => handleListDirectory(args, ctx),
	);

	server.registerTool(
		"list_directory_with_sizes",
		{
			description:
				"List directory contents with sizes. Sortable by name (default) or size.",
			inputSchema: z.object({
				path: z.string(),
				sortBy: z.enum(["name", "size"]).optional(),
			}),
		},
		async (args) => handleListDirectoryWithSizes(args, ctx),
	);

	server.registerTool(
		"directory_tree",
		{
			description:
				"Return a recursive tree of all objects under a path. Supports glob excludePatterns.",
			inputSchema: z.object({
				path: z.string(),
				excludePatterns: z.array(z.string()).optional(),
			}),
		},
		async (args) => handleDirectoryTree(args, ctx),
	);
}
