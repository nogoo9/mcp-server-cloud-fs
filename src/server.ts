// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ParsedRoot } from "./providers/interface.js";
import { registerDirectoryTools } from "./tools/directory.js";
import { registerExtendedTools } from "./tools/extended.js";
import { registerInfoTools } from "./tools/info.js";
import { registerMoveTools } from "./tools/move.js";
import { registerReadTools } from "./tools/read.js";
import { registerSearchTools } from "./tools/search.js";
import { registerShellTool } from "./tools/shell/index.js";
import { registerWriteTools } from "./tools/write.js";
import type { VirtualFS } from "./vfs.js";

export interface ServerContext {
	vfs: VirtualFS;
	roots: ParsedRoot[];
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
				html = await fs.readFile(
					path.join(import.meta.dirname, "app", "shell-app.html"),
					"utf-8",
				);
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

export function createMcpServer(ctx: ServerContext): McpServer {
	const server = new McpServer({
		name: "mcp-server-cloud-fs",
		version: "0.3.0",
	});

	registerReadTools(server, ctx);
	registerWriteTools(server, ctx);
	registerDirectoryTools(server, ctx);
	registerMoveTools(server, ctx);
	registerSearchTools(server, ctx);
	registerInfoTools(server, ctx);
	registerExtendedTools(server, ctx);

	if (ctx.enableShell) {
		registerShellTool(server, ctx);
		void tryRegisterShellApp(server);
	}

	return server;
}
