// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ParsedRoot, StorageProvider } from "./providers/interface.js";
import { registerDirectoryTools } from "./tools/directory.js";
import { registerExtendedTools } from "./tools/extended.js";
import { registerInfoTools } from "./tools/info.js";
import { registerMoveTools } from "./tools/move.js";
import { registerPresignedTools } from "./tools/presigned.js";
import { registerReadTools } from "./tools/read.js";
import { registerSearchTools } from "./tools/search.js";
import { registerShellTool } from "./tools/shell/index.js";
import { registerWriteTools } from "./tools/write.js";
import type { VirtualFS } from "./vfs.js";

/**
 * Configuration object passed to {@link createMcpServer}.
 *
 * Holds the VFS instance, configured storage roots, and feature flags
 * that control which tools are registered on the MCP server.
 *
 * @category Core
 */
export interface ServerContext {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	/** The underlying StorageProvider, used for provider-specific features (e.g. presigned URLs). */
	provider: StorageProvider;
	/** Enable the delete_file tool. Default: false. */
	enableDelete?: boolean;
	/** Maximum number of objects grep_files will scan per call. Default: 1000. */
	grepMaxObjects?: number;
	/** Enable the shell tool. Default: false. */
	enableShell?: boolean;
}

/**
 * Try to register the shell as an MCP App (xterm.js UI).
 * Falls back silently if the bundled HTML is not available
 * (e.g. `bun run build:app` was not run).
 */
async function tryRegisterShellApp(server: McpServer): Promise<void> {
	let registerAppTool: typeof import("@modelcontextprotocol/ext-apps/server").registerAppTool;
	let registerAppResource: typeof import("@modelcontextprotocol/ext-apps/server").registerAppResource;
	let RESOURCE_MIME_TYPE: string;

	try {
		const mod = await import("@modelcontextprotocol/ext-apps/server");
		registerAppTool = mod.registerAppTool;
		registerAppResource = mod.registerAppResource;
		RESOURCE_MIME_TYPE = mod.RESOURCE_MIME_TYPE;
	} catch {
		// ext-apps not installed — skip silently
		return;
	}

	const resourceUri = "ui://cloud-fs/shell-app.html";

	// Register the App resource (serves the bundled HTML)
	registerAppResource(
		server,
		resourceUri,
		resourceUri,
		{ mimeType: RESOURCE_MIME_TYPE },
		async () => {
			let html: string;
			try {
				const fs = await import("node:fs/promises");
				const path = await import("node:path");
				// Prefer the bundled build (single-file HTML with inlined JS/CSS).
				// When running from source (bun src/server.ts), import.meta.dirname
				// is "src/", so we resolve upward to find dist/app/.
				// When running from dist (node dist/server.js), it's "dist/".
				const candidates = [
					path.resolve(
						import.meta.dirname,
						"..",
						"dist",
						"app",
						"shell-app.html",
					),
					path.resolve(import.meta.dirname, "app", "shell-app.html"),
				];
				html = "";
				for (const candidate of candidates) {
					try {
						html = await fs.readFile(candidate, "utf-8");
						break;
					} catch {
						// try next candidate
					}
				}
				if (!html) {
					throw new Error("Shell app HTML not found");
				}
			} catch {
				return {
					contents: [
						{
							uri: resourceUri,
							mimeType: RESOURCE_MIME_TYPE,
							text: "<html><body><p>Shell app not built. Run: <code>bun run build:app</code></p></body></html>",
						},
					],
				};
			}
			return {
				contents: [
					{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
				],
			};
		},
	);

	// Register the App tool (wraps shell with a UI pointer)
	const { z } = await import("zod");
	registerAppTool(
		server,
		"shell_app",
		{
			title: "Interactive Shell (UI)",
			description:
				"Opens an interactive terminal UI for executing cloud-fs shell commands. " +
				"Supports ls, cat, grep, find, and 13 more POSIX-like commands with piping (|) and redirection (>, >>).",
			inputSchema: {
				command: z
					.string()
					.optional()
					.describe("Optional initial command to execute"),
			},
			_meta: { ui: { resourceUri } },
		},
		async ({ command }) => {
			return {
				content: [
					{
						type: "text" as const,
						text: command
							? `Shell opened. Initial command: ${command}`
							: "Interactive shell opened. Type 'help' for available commands.",
					},
				],
			};
		},
	);
}

/**
 * Create and configure an MCP server with all cloud-fs tools.
 *
 * Registers read, write, directory, move, search, info, and extended tool
 * groups. Optionally registers the shell tool and xterm.js shell app
 * when `ctx.enableShell` is `true`.
 *
 * @param ctx - Server configuration including VFS, roots, and feature flags.
 * @returns A fully configured {@link McpServer} ready to be connected to a transport.
 *
 * @category Core
 */
export async function createMcpServer(ctx: ServerContext): Promise<McpServer> {
	const server = new McpServer({
		name: "mcp-server-cloud-fs",
		version: "0.4.0",
	});

	registerReadTools(server, ctx);
	registerWriteTools(server, ctx);
	registerDirectoryTools(server, ctx);
	registerMoveTools(server, ctx);
	registerSearchTools(server, ctx);
	registerInfoTools(server, ctx);
	registerExtendedTools(server, ctx);
	registerPresignedTools(server, ctx);

	if (ctx.enableShell) {
		registerShellTool(server, ctx);
		await tryRegisterShellApp(server);
	}

	return server;
}
