// src/tools/metadata.ts
// Tools for reading/writing cloud object metadata and tags.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { StorageProvider } from "../providers/interface.js";
import type { ServerContext } from "../server.js";

interface MetadataCtx {
	roots: ServerContext["roots"];
	provider: StorageProvider;
}

type ToolResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

/** Handler for get_object_metadata. */
export async function handleGetObjectMetadata(
	args: { path: string },
	ctx: MetadataCtx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		if (!ctx.provider.getObjectMetadata) {
			return {
				content: [
					{
						type: "text",
						text: "Object metadata is not supported by this storage provider.",
					},
				],
				isError: true,
			};
		}

		const meta = await ctx.provider.getObjectMetadata(root, key);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							key: meta.key,
							size: meta.size,
							lastModified: meta.lastModified.toISOString(),
							contentType: meta.contentType,
							metadata: meta.metadata,
							tags: meta.tags,
						},
						null,
						2,
					),
				},
			],
		};
	} catch (err) {
		return {
			content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
			isError: true,
		};
	}
}

/** Handler for set_object_tags. */
export async function handleSetObjectTags(
	args: { path: string; tags: Record<string, string> },
	ctx: MetadataCtx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		if (!ctx.provider.setObjectTags) {
			return {
				content: [
					{
						type: "text",
						text: "Setting object tags is not supported by this storage provider.",
					},
				],
				isError: true,
			};
		}

		await ctx.provider.setObjectTags(root, key, args.tags);
		const tagCount = Object.keys(args.tags).length;
		return {
			content: [
				{
					type: "text",
					text: `Set ${tagCount} tag${tagCount === 1 ? "" : "s"} on ${args.path}`,
				},
			],
		};
	} catch (err) {
		return {
			content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
			isError: true,
		};
	}
}

/** Handler for search_by_tag. */
export async function handleSearchByTag(
	args: {
		path: string;
		tags: Record<string, string>;
		max_objects?: number;
	},
	ctx: MetadataCtx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		if (!ctx.provider.getObjectTags) {
			return {
				content: [
					{
						type: "text",
						text: "Tag search is not supported by this storage provider.",
					},
				],
				isError: true,
			};
		}

		const maxObjects = Math.min(args.max_objects ?? 100, 1000);
		const tagEntries = Object.entries(args.tags);

		// List objects under the prefix, then filter by tags
		const listing = await ctx.provider.listObjects(root, key);
		const matches: string[] = [];

		for (const obj of listing.objects) {
			if (matches.length >= maxObjects) break;
			try {
				const objTags = await ctx.provider.getObjectTags!(root, obj.key);
				const allMatch = tagEntries.every(([k, v]) => objTags[k] === v);
				if (allMatch) {
					matches.push(`${root.scheme}://${root.bucket}/${obj.key}`);
				}
			} catch {
				// Skip objects where tags can't be read
			}
		}

		return {
			content: [
				{
					type: "text",
					text:
						matches.length > 0
							? `Found ${matches.length} object${matches.length === 1 ? "" : "s"} matching tags:\n${matches.join("\n")}`
							: "No objects found matching the specified tags.",
				},
			],
		};
	} catch (err) {
		return {
			content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
			isError: true,
		};
	}
}

/** Register metadata and tag tools on the MCP server. */
export function registerMetadataTools(
	server: McpServer,
	ctx: ServerContext,
): void {
	server.registerTool(
		"get_object_metadata",
		{
			title: "Get Object Metadata",
			description:
				"Get cloud-native metadata and tags for an object (content-type, custom headers, tags).",
			inputSchema: {
				path: z.string().describe("Full cloud URI (e.g. s3://bucket/key)"),
			},
		},
		async (args) => handleGetObjectMetadata(args, ctx),
	);

	server.registerTool(
		"set_object_tags",
		{
			title: "Set Object Tags",
			description:
				"Set or update tags on a cloud object. Replaces all existing tags with the provided ones.",
			inputSchema: {
				path: z.string().describe("Full cloud URI"),
				tags: z
					.record(z.string(), z.string())
					.describe("Key-value tag pairs to set"),
			},
		},
		async (args) => handleSetObjectTags(args, ctx),
	);

	server.registerTool(
		"search_by_tag",
		{
			title: "Search by Tag",
			description:
				"Find objects matching tag filters under a path. Uses AND logic for multiple tag filters.",
			inputSchema: {
				path: z.string().describe("Root path to search under"),
				tags: z
					.record(z.string(), z.string())
					.describe("Tag key-value pairs to match (AND logic)"),
				max_objects: z
					.number()
					.int()
					.positive()
					.default(100)
					.describe("Max objects to return (default: 100, max: 1000)"),
			},
		},
		async (args) => handleSearchByTag(args, ctx),
	);
}
