// src/resources/index.ts
// Expose bucket hierarchies as MCP Resources for client-side browsing.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";

/**
 * Register static root resources and a browsable resource template
 * so MCP clients can discover and navigate cloud storage without
 * calling tools.
 */
export function registerResources(server: McpServer, ctx: ServerContext): void {
	// ── Static root resources ──────────────────────────────────────────
	for (const root of ctx.roots) {
		const uri = `cloud-fs://${root.uri}/`;
		server.registerResource(
			`root:${root.uri}`,
			uri,
			{
				description: `Top-level listing of ${root.uri}`,
				mimeType: "application/json",
			},
			async () => {
				const listing = await ctx.vfs.list(root, root.prefix, "/");
				const text = JSON.stringify(
					{
						root: root.uri,
						objects: listing.objects.map((o) => ({
							key: o.key,
							size: o.size,
							lastModified: o.lastModified.toISOString(),
							contentType: o.contentType,
						})),
						prefixes: listing.prefixes,
					},
					null,
					2,
				);
				return {
					contents: [{ uri, mimeType: "application/json", text }],
				};
			},
		);
	}

	// ── Browsable resource template ────────────────────────────────────
	const template = new ResourceTemplate("cloud-fs://{+cloudPath}", {
		list: undefined,
	});

	server.registerResource(
		"cloud-fs-browse",
		template,
		{
			description:
				"Browse files and directories in configured cloud storage roots.",
			mimeType: "text/plain",
		},
		async (_uri, variables) => {
			const cloudPath =
				typeof variables.cloudPath === "string"
					? variables.cloudPath
					: Array.isArray(variables.cloudPath)
						? variables.cloudPath.join("/")
						: "";

			// Try to match against configured roots
			for (const root of ctx.roots) {
				const rootUri = root.uri;
				if (!cloudPath.startsWith(rootUri)) continue;

				const suffix = cloudPath.slice(rootUri.length).replace(/^\//, "");
				const key = root.prefix
					? suffix
						? `${root.prefix}/${suffix}`
						: root.prefix
					: suffix;

				// If path ends with "/" or is empty, treat as directory listing
				if (!suffix || suffix.endsWith("/")) {
					const listing = await ctx.vfs.list(root, key, "/");
					const text = JSON.stringify(
						{
							root: rootUri,
							path: key,
							objects: listing.objects.map((o) => ({
								key: o.key,
								size: o.size,
								lastModified: o.lastModified.toISOString(),
								contentType: o.contentType,
							})),
							prefixes: listing.prefixes,
						},
						null,
						2,
					);
					const resourceUri = `cloud-fs://${cloudPath}`;
					return {
						contents: [
							{ uri: resourceUri, mimeType: "application/json", text },
						],
					};
				}

				// Otherwise, treat as file read
				const buffer = await ctx.vfs.get(root, key);
				const stat = await ctx.vfs.stat(root, key);
				const mimeType = stat.contentType ?? "application/octet-stream";
				const isText =
					mimeType.startsWith("text/") ||
					mimeType === "application/json" ||
					mimeType === "application/xml";

				const resourceUri = `cloud-fs://${cloudPath}`;
				if (isText) {
					return {
						contents: [
							{ uri: resourceUri, mimeType, text: buffer.toString("utf-8") },
						],
					};
				}
				// Binary — return as base64 blob
				return {
					contents: [
						{
							uri: resourceUri,
							mimeType,
							blob: buffer.toString("base64"),
						},
					],
				};
			}

			// No matching root
			const resourceUri = `cloud-fs://${cloudPath}`;
			return {
				contents: [
					{
						uri: resourceUri,
						mimeType: "text/plain",
						text: `Error: path "${cloudPath}" is not within any configured root.`,
					},
				],
			};
		},
	);
}
