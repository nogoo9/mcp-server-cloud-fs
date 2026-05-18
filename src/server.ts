// src/server.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { shouldRegisterTool } from "./auth/scopes.js";
import type { AuditLogger } from "./middleware/audit.js";
import { applyDlpWrapper, type DlpPattern } from "./middleware/dlp.js";
import type { ParsedRoot, StorageProvider } from "./providers/interface.js";
import { registerResources } from "./resources/index.js";
import { registerDirectoryTools } from "./tools/directory.js";
import { registerExtendedTools } from "./tools/extended.js";
import { registerInfoTools } from "./tools/info.js";
import { registerMetadataTools } from "./tools/metadata.js";
import { registerMoveTools } from "./tools/move.js";
import { registerPresignedTools } from "./tools/presigned.js";
import { registerReadTools } from "./tools/read.js";
import { registerSearchTools } from "./tools/search.js";
import { registerShellTool } from "./tools/shell/index.js";
import { registerVersioningTools } from "./tools/versioning.js";
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
	/** Optional audit logger for tool invocation transparency. */
	auditLogger?: AuditLogger;
	/**
	 * OAuth scopes granted to the current session.
	 * When set, only tools matching these scopes are registered.
	 * Omit to register all tools (backwards-compatible default).
	 */
	grantedScopes?: string[];
	/** Enable DLP (Data Loss Prevention) content sanitization. */
	enableDlp?: boolean;
	/** Custom DLP patterns. When omitted, uses built-in defaults. */
	dlpPatterns?: DlpPattern[];
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

	// If audit logging is enabled, wrap registerTool to intercept handler calls.
	if (ctx.auditLogger) {
		const logger = ctx.auditLogger;
		const original = server.registerTool.bind(server);
		// biome-ignore lint/suspicious/noExplicitAny: wrapping generic registerTool overloads
		(server as any).registerTool = (name: string, ...rest: any[]) => {
			// Last argument is the handler callback
			const handler = rest[rest.length - 1];
			if (typeof handler === "function") {
				rest[rest.length - 1] = async (...handlerArgs: unknown[]) => {
					const start = performance.now();
					try {
						const result = await handler(...handlerArgs);
						logger.logToolCall(
							name,
							(handlerArgs[0] ?? {}) as Record<string, unknown>,
							{ success: true, duration_ms: performance.now() - start },
						);
						return result;
					} catch (err) {
						logger.logToolCall(
							name,
							(handlerArgs[0] ?? {}) as Record<string, unknown>,
							{
								success: false,
								error: (err as Error).message,
								duration_ms: performance.now() - start,
							},
						);
						throw err;
					}
				};
			}
			// biome-ignore lint/suspicious/noExplicitAny: calling original overloaded registerTool
			return (original as any)(name, ...rest);
		};
	}

	// DLP: wrap registerTool to sanitize text responses before delivery.
	if (ctx.enableDlp) {
		applyDlpWrapper(server, ctx.dlpPatterns);
	}

	// Scope-aware tool registration: when grantedScopes is set,
	// wrap registerTool to skip tools not matching the session's scopes.
	if (ctx.grantedScopes) {
		const scopes = ctx.grantedScopes;
		const original = server.registerTool.bind(server);
		// biome-ignore lint/suspicious/noExplicitAny: wrapping generic registerTool overloads
		(server as any).registerTool = (name: string, ...rest: any[]) => {
			if (!shouldRegisterTool(name, scopes)) return;
			// biome-ignore lint/suspicious/noExplicitAny: calling original overloaded registerTool
			return (original as any)(name, ...rest);
		};
	}

	registerReadTools(server, ctx);
	registerWriteTools(server, ctx);
	registerDirectoryTools(server, ctx);
	registerMoveTools(server, ctx);
	registerSearchTools(server, ctx);
	registerInfoTools(server, ctx);
	registerExtendedTools(server, ctx);
	registerPresignedTools(server, ctx);
	registerMetadataTools(server, ctx);
	registerVersioningTools(server, ctx);

	// Read-only MCP Resources for client-side browsing
	registerResources(server, ctx);

	if (ctx.enableShell) {
		registerShellTool(server, ctx);
		await tryRegisterShellApp(server);
	}

	return server;
}
