// src/tools/versioning.ts
// Tools for listing and restoring object versions.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveToolPath } from "../path-utils.js";
import type { StorageProvider } from "../providers/interface.js";
import type { ServerContext } from "../server.js";

interface VersioningCtx {
	roots: ServerContext["roots"];
	provider: StorageProvider;
}

type ToolResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

/** Handler for list_versions. */
export async function handleListVersions(
	args: { path: string; max_versions?: number },
	ctx: VersioningCtx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		if (!ctx.provider.listObjectVersions) {
			return {
				content: [
					{
						type: "text",
						text: "Version listing is not supported by this storage provider.",
					},
				],
				isError: true,
			};
		}

		const versions = await ctx.provider.listObjectVersions(root, key);
		const max = args.max_versions ?? 20;
		const limited = versions.slice(-max);

		if (limited.length === 0) {
			return {
				content: [{ type: "text", text: `No versions found for ${args.path}` }],
			};
		}

		const lines = limited.map((v) => {
			const marker = v.isLatest ? " [latest]" : "";
			const del = v.isDeleteMarker ? " [delete-marker]" : "";
			return `  ${v.versionId}  ${v.lastModified.toISOString()}  ${v.size} bytes${marker}${del}`;
		});

		return {
			content: [
				{
					type: "text",
					text: `${limited.length} version${limited.length === 1 ? "" : "s"} for ${args.path}:\n${lines.join("\n")}`,
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

/** Handler for restore_version. */
export async function handleRestoreVersion(
	args: { path: string; version_id: string },
	ctx: VersioningCtx,
): Promise<ToolResult> {
	try {
		const { root, key } = resolveToolPath(ctx.roots, args.path);

		if (!ctx.provider.restoreObjectVersion) {
			return {
				content: [
					{
						type: "text",
						text: "Version restore is not supported by this storage provider.",
					},
				],
				isError: true,
			};
		}

		await ctx.provider.restoreObjectVersion(root, key, args.version_id);

		return {
			content: [
				{
					type: "text",
					text: `Restored ${args.path} to version ${args.version_id}`,
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

/** Register versioning tools on the MCP server. */
export function registerVersioningTools(
	server: McpServer,
	ctx: ServerContext,
): void {
	server.registerTool(
		"list_versions",
		{
			title: "List Object Versions",
			description:
				"List version history for a cloud object. Requires versioning-enabled bucket.",
			inputSchema: {
				path: z.string().describe("Full cloud URI of the object"),
				max_versions: z
					.number()
					.int()
					.positive()
					.default(20)
					.describe("Maximum number of versions to return (default: 20)"),
			},
		},
		async (args) => handleListVersions(args, ctx),
	);

	server.registerTool(
		"restore_version",
		{
			title: "Restore Object Version",
			description:
				"Restore a previous version of a cloud object. Copies the old version content over the current one.",
			inputSchema: {
				path: z.string().describe("Full cloud URI of the object"),
				version_id: z
					.string()
					.describe("Version ID to restore (from list_versions output)"),
			},
		},
		async (args) => handleRestoreVersion(args, ctx),
	);
}
