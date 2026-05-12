// src/transports/http.ts
// Streamable HTTP transport — dual-runtime: Bun-native and Node.js (Express).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ManagedTransport, TransportOptions } from "./index.js";
import { isBun } from "./index.js";

/** Generate a UUID v7 session ID. Falls back to crypto.randomUUID() if uuidv7 is unavailable. */
async function generateSessionId(): Promise<string> {
	try {
		const { uuidv7 } = await import("uuidv7");
		return uuidv7();
	} catch {
		return crypto.randomUUID();
	}
}

/** Build CORS headers based on options and request origin. */
function corsHeaders(
	requestOrigin: string | null,
	allowedOrigins: string[],
	isLocalhost: boolean,
): Record<string, string> {
	const headers: Record<string, string> = {
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Authorization",
		"Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
		"Access-Control-Max-Age": "86400",
	};

	if (!requestOrigin) return headers;

	// Localhost dev mode: allow all origins
	if (isLocalhost && allowedOrigins.length === 0) {
		headers["Access-Control-Allow-Origin"] = requestOrigin;
		headers.Vary = "Origin";
		return headers;
	}

	// Production: strict allowlist
	if (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin)) {
		headers["Access-Control-Allow-Origin"] = requestOrigin;
		headers.Vary = "Origin";
	}

	return headers;
}

/** Health check response. */
function healthResponse(path: string, ready: boolean): Response | null {
	if (path === "/healthz") {
		return new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (path === "/readyz") {
		const status = ready ? "ready" : "starting";
		return new Response(JSON.stringify({ status }), {
			status: ready ? 200 : 503,
			headers: { "Content-Type": "application/json" },
		});
	}
	return null;
}

/** Create log entry for structured request logging. */
function logRequest(
	method: string,
	path: string,
	status: number,
	startTime: number,
	sessionId?: string,
): void {
	const entry = {
		ts: new Date().toISOString(),
		method,
		path,
		status,
		latencyMs: Math.round(performance.now() - startTime),
		...(sessionId && { sessionId }),
	};
	console.error(JSON.stringify(entry));
}

// ------------------------------------------------------------------
// Bun-native HTTP transport
// ------------------------------------------------------------------

interface BunServer {
	stop(closeActiveConnections?: boolean): void;
	port: number;
	hostname: string;
}

function createBunHttpTransport(options: TransportOptions): ManagedTransport {
	let bunServer: BunServer | null = null;
	let isReady = false;
	let _mcpServer: McpServer | null = null;

	// Per-session transport map
	const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

	const isLocalhost =
		options.host === "127.0.0.1" ||
		options.host === "localhost" ||
		options.host === "::1";

	return {
		transport: null, // HTTP is multi-session, no single transport

		async start(server: McpServer) {
			_mcpServer = server;

			bunServer = Bun.serve({
				port: options.port,
				hostname: options.host,

				async fetch(req: Request): Promise<Response> {
					const startTime = performance.now();
					const url = new URL(req.url);
					const origin = req.headers.get("Origin");

					// CORS preflight
					if (req.method === "OPTIONS") {
						const cors = corsHeaders(origin, options.corsOrigins, isLocalhost);
						if (options.requestLogging)
							logRequest("OPTIONS", url.pathname, 204, startTime);
						return new Response(null, { status: 204, headers: cors });
					}

					// Health checks
					const healthResp = healthResponse(url.pathname, isReady);
					if (healthResp) {
						if (options.requestLogging)
							logRequest(
								req.method,
								url.pathname,
								healthResp.status,
								startTime,
							);
						return healthResp;
					}

					// Only handle /mcp path
					if (url.pathname !== "/mcp") {
						if (options.requestLogging)
							logRequest(req.method, url.pathname, 404, startTime);
						return new Response("Not Found", { status: 404 });
					}

					// Resolve or create session transport
					const sessionId = req.headers.get("Mcp-Session-Id");
					let transport: WebStandardStreamableHTTPServerTransport;

					if (sessionId && sessions.has(sessionId)) {
						transport = sessions.get(sessionId)!;
					} else if (!sessionId && req.method === "POST") {
						// New session — create transport
						const newSessionId = await generateSessionId();
						transport = new WebStandardStreamableHTTPServerTransport({
							sessionIdGenerator: () => newSessionId,
							onsessioninitialized: (sid) => {
								sessions.set(sid, transport);
							},
							onsessionclosed: (sid) => {
								sessions.delete(sid);
							},
						});
						transport.onclose = () => {
							if (transport.sessionId) {
								sessions.delete(transport.sessionId);
							}
						};
						await server.connect(transport);
					} else if (sessionId && !sessions.has(sessionId)) {
						if (options.requestLogging)
							logRequest(req.method, url.pathname, 404, startTime);
						return new Response("Session not found", { status: 404 });
					} else {
						if (options.requestLogging)
							logRequest(req.method, url.pathname, 400, startTime);
						return new Response("Bad Request", { status: 400 });
					}

					// Handle the MCP request
					const response = await transport.handleRequest(req);

					// Add CORS headers to the response
					const cors = corsHeaders(origin, options.corsOrigins, isLocalhost);
					for (const [key, value] of Object.entries(cors)) {
						response.headers.set(key, value);
					}

					if (options.requestLogging) {
						logRequest(
							req.method,
							url.pathname,
							response.status,
							startTime,
							transport.sessionId,
						);
					}

					return response;
				},
			}) as BunServer;

			isReady = true;
			console.error(
				`cloud-fs-mcp HTTP (Bun) listening on http://${bunServer.hostname}:${bunServer.port}/mcp`,
			);
		},

		async stop() {
			// Close all active sessions
			for (const [, transport] of sessions) {
				await transport.close();
			}
			sessions.clear();
			bunServer?.stop(true);
			bunServer = null;
			isReady = false;
		},
	};
}

// ------------------------------------------------------------------
// Node.js (Express) HTTP transport
// ------------------------------------------------------------------

function createNodeHttpTransport(options: TransportOptions): ManagedTransport {
	let httpServer: { close: (cb?: (err?: Error) => void) => void } | null = null;
	let isReady = false;

	return {
		transport: null,

		async start(server: McpServer) {
			// Dynamic imports — Express is an optional peer dependency
			let expressFn: (...args: unknown[]) => unknown;
			let expressJson: (...args: unknown[]) => unknown;

			try {
				const mod = await import("express");
				// Handle both ESM default and CJS interop
				expressFn = (mod.default ?? mod) as (...args: unknown[]) => unknown;
				expressJson = (mod.default?.json ??
					(mod as Record<string, unknown>).json) as (
					...args: unknown[]
				) => unknown;
			} catch {
				throw new Error(
					"Express is required for HTTP transport on Node.js. Install it: npm install express",
				);
			}

			let StreamableTransport: {
				new (
					opts: Record<string, unknown>,
				): Transport & {
					handleRequest(
						req: unknown,
						res: unknown,
						body?: unknown,
					): Promise<void>;
					sessionId?: string;
				};
			};

			try {
				const mod = await import(
					"@modelcontextprotocol/sdk/server/streamableHttp.js"
				);
				StreamableTransport =
					mod.StreamableHTTPServerTransport as typeof StreamableTransport;
			} catch {
				throw new Error(
					"StreamableHTTPServerTransport not available in SDK. Update @modelcontextprotocol/sdk.",
				);
			}

			// biome-ignore lint/suspicious/noExplicitAny: Express app type is complex with dynamic import
			const app = (expressFn as any)();
			app.use(expressJson());

			// Per-session transport map
			type SessionTransport = InstanceType<typeof StreamableTransport>;
			const sessions = new Map<string, SessionTransport>();

			const isLocalhost =
				options.host === "127.0.0.1" ||
				options.host === "localhost" ||
				options.host === "::1";

			// CORS middleware
			// biome-ignore lint/suspicious/noExplicitAny: Express middleware types
			app.use((req: any, res: any, next: any) => {
				const origin = req.headers.origin ?? null;
				const cors = corsHeaders(origin, options.corsOrigins, isLocalhost);
				for (const [key, value] of Object.entries(cors)) {
					res.setHeader(key, value);
				}
				if (req.method === "OPTIONS") {
					res.status(204).end();
					return;
				}
				next();
			});

			// Health checks
			// biome-ignore lint/suspicious/noExplicitAny: Express route handler types
			app.get("/healthz", (_req: any, res: any) => {
				res.json({ status: "ok" });
			});
			// biome-ignore lint/suspicious/noExplicitAny: Express route handler types
			app.get("/readyz", (_req: any, res: any) => {
				if (isReady) {
					res.json({ status: "ready" });
				} else {
					res.status(503).json({ status: "starting" });
				}
			});

			// MCP endpoint
			// biome-ignore lint/suspicious/noExplicitAny: Express route handler types
			app.all("/mcp", async (req: any, res: any) => {
				const sessionId = req.headers["mcp-session-id"] as string | undefined;
				let transport: SessionTransport;

				if (sessionId && sessions.has(sessionId)) {
					transport = sessions.get(sessionId)!;
				} else if (!sessionId && req.method === "POST") {
					const newSessionId = await generateSessionId();
					transport = new StreamableTransport({
						sessionIdGenerator: () => newSessionId,
						onsessioninitialized: (sid: string) => {
							sessions.set(sid, transport);
						},
						onsessionclosed: (sid: string) => {
							sessions.delete(sid);
						},
					});
					transport.onclose = () => {
						if (transport.sessionId) {
							sessions.delete(transport.sessionId);
						}
					};
					await server.connect(transport);
				} else if (sessionId && !sessions.has(sessionId)) {
					res.status(404).send("Session not found");
					return;
				} else {
					res.status(400).send("Bad Request");
					return;
				}

				await transport.handleRequest(req, res, req.body);
			});

			httpServer = app.listen(options.port, options.host, () => {
				isReady = true;
				console.error(
					`cloud-fs-mcp HTTP (Node/Express) listening on http://${options.host}:${options.port}/mcp`,
				);
			});
		},

		async stop() {
			return new Promise<void>((resolve, reject) => {
				if (!httpServer) {
					resolve();
					return;
				}
				httpServer.close((err) => {
					httpServer = null;
					isReady = false;
					if (err) reject(err);
					else resolve();
				});
			});
		},
	};
}

// ------------------------------------------------------------------
// Factory
// ------------------------------------------------------------------

export function createHttpTransport(
	options: TransportOptions,
): ManagedTransport {
	if (isBun()) {
		return createBunHttpTransport(options);
	}
	return createNodeHttpTransport(options);
}
