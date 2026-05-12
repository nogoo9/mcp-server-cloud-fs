// src/transports/ws.ts
// WebSocket transport — Bun-native using Bun.serve() WebSocket upgrade.
// Implements the SDK Transport interface over JSON-RPC WebSocket framing.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
	Transport,
	TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	JSONRPCMessage,
	MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";
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

/**
 * WebSocket server transport adapter.
 * Wraps a Bun WebSocket connection to implement the MCP SDK Transport interface.
 */
export class WebSocketServerTransport implements Transport {
	sessionId?: string;
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: <T extends JSONRPCMessage>(
		message: T,
		extra?: MessageExtraInfo,
	) => void;

	private _ws: {
		send(data: string | ArrayBuffer | Uint8Array): void;
		close(code?: number, reason?: string): void;
		readyState: number;
	} | null = null;
	private _started = false;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	/** Attach the underlying WebSocket. Called internally when WS is upgraded. */
	attachSocket(ws: {
		send(data: string | ArrayBuffer | Uint8Array): void;
		close(code?: number, reason?: string): void;
		readyState: number;
	}): void {
		this._ws = ws;
	}

	/** Process an incoming text message from the WebSocket. */
	handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as JSONRPCMessage;
			this.onmessage?.(message);
		} catch (err) {
			this.onerror?.(
				err instanceof Error ? err : new Error(String(err)),
			);
		}
	}

	/** Called when the WebSocket is closed. */
	handleClose(): void {
		this._ws = null;
		this.onclose?.();
	}

	async start(): Promise<void> {
		this._started = true;
	}

	async send(
		message: JSONRPCMessage,
		_options?: TransportSendOptions,
	): Promise<void> {
		if (!this._ws || this._ws.readyState !== 1) {
			throw new Error("WebSocket is not open");
		}
		this._ws.send(JSON.stringify(message));
	}

	async close(): Promise<void> {
		this._ws?.close(1000, "Server closing");
		this._ws = null;
		this.onclose?.();
	}
}

// ------------------------------------------------------------------
// Bun-native WebSocket transport
// ------------------------------------------------------------------

interface BunServer {
	stop(closeActiveConnections?: boolean): void;
	port: number;
	hostname: string;
}

export function createWsTransport(options: TransportOptions): ManagedTransport {
	if (!isBun()) {
		throw new Error(
			"WebSocket transport requires Bun runtime. Use --transport http on Node.js.",
		);
	}

	let bunServer: BunServer | null = null;
	let mcpServer: McpServer | null = null;
	const sessions = new Map<string, WebSocketServerTransport>();

	interface WsData {
		sessionId: string;
	}

	return {
		transport: null,

		async start(server: McpServer) {
			mcpServer = server;

			// biome-ignore lint/suspicious/noExplicitAny: Bun.serve generic typing requires any for the websocket data interface
			bunServer = (Bun as any).serve({
				port: options.port,
				hostname: options.host,

				// biome-ignore lint/suspicious/noExplicitAny: Bun.serve fetch handler types
				async fetch(req: Request, bunServerRef: any): Promise<Response | undefined> {
					const url = new URL(req.url);

					// Health checks
					if (url.pathname === "/healthz") {
						return new Response(JSON.stringify({ status: "ok" }), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						});
					}
					if (url.pathname === "/readyz") {
						return new Response(JSON.stringify({ status: "ready" }), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						});
					}

					// WebSocket upgrade on /mcp
					if (url.pathname === "/mcp") {
						const sessionId = await generateSessionId();
						const upgraded = bunServerRef.upgrade(req, {
							data: { sessionId } satisfies WsData,
						});
						if (!upgraded) {
							return new Response("WebSocket upgrade failed", { status: 426 });
						}
						// Bun returns undefined on successful upgrade
						return undefined;
					}

					return new Response("Not Found", { status: 404 });
				},

				websocket: {
					// biome-ignore lint/suspicious/noExplicitAny: Bun ServerWebSocket generic data type
					async open(ws: any) {
						const { sessionId } = ws.data as WsData;
						const transport = new WebSocketServerTransport(sessionId);
						transport.attachSocket(ws);
						sessions.set(sessionId, transport);
						await server.connect(transport);
					},

					// biome-ignore lint/suspicious/noExplicitAny: Bun ServerWebSocket generic data type
					message(ws: any, message: string | ArrayBuffer | Uint8Array) {
						const { sessionId } = ws.data as WsData;
						const transport = sessions.get(sessionId);
						if (transport) {
							const text =
								typeof message === "string"
									? message
									: new TextDecoder().decode(message);
							transport.handleMessage(text);
						}
					},

					// biome-ignore lint/suspicious/noExplicitAny: Bun ServerWebSocket generic data type
					close(ws: any) {
						const { sessionId } = ws.data as WsData;
						const transport = sessions.get(sessionId);
						if (transport) {
							transport.handleClose();
							sessions.delete(sessionId);
						}
					},

					// Bun handles ping/pong automatically
				},
			}) as BunServer;

			console.error(
				`cloud-fs-mcp WS (Bun) listening on ws://${bunServer.hostname}:${bunServer.port}/mcp`,
			);
		},

		async stop() {
			for (const [, transport] of sessions) {
				await transport.close();
			}
			sessions.clear();
			bunServer?.stop(true);
			bunServer = null;
		},
	};
}
