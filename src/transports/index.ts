// src/transports/index.ts
// Transport factory — runtime detection and unified config interface.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type TransportType = "stdio" | "http" | "ws";

export interface TransportOptions {
	/** Listen port for http/ws transports. Default: 3000. */
	port: number;
	/** Bind address for http/ws transports. Default: "127.0.0.1". */
	host: string;
	/** Allowed CORS origins. Empty = restrict in production, allow-all for localhost dev. */
	corsOrigins: string[];
	/** Auth mode. */
	auth: "none" | "builtin" | "external";
	/** OAuth issuer URL (builtin mode). */
	authIssuer?: string | undefined;
	/** JWKS URI for token verification (external mode). */
	authJwksUri?: string | undefined;
	/** Expected token audience (external mode). */
	authAudience?: string | undefined;
	/** Enable ext-auth Client Credentials flow. */
	authClientCredentials: boolean;
	/** Enterprise IdP URL for ext-auth Enterprise-Managed Authorization. */
	authEnterpriseIdp?: string | undefined;
	/** Rate limit requests per minute per client. 0 = disabled (default). */
	rateLimit: number;
	/** Rate limit burst allowance. Default: 10. */
	rateLimitBurst: number;
	/** Enable structured JSON request logging to stderr. */
	requestLogging: boolean;
}

export const DEFAULT_TRANSPORT_OPTIONS: TransportOptions = {
	port: 3000,
	host: "127.0.0.1",
	corsOrigins: [],
	auth: "none",
	authClientCredentials: false,
	rateLimit: 0,
	rateLimitBurst: 10,
	requestLogging: false,
};

/** A managed transport wrapping start/stop lifecycle. */
export interface ManagedTransport {
	/** The underlying SDK transport (or null for HTTP/WS where transport is per-session). */
	transport: Transport | null;
	/** Start the server. For STDIO, connects the transport. For HTTP/WS, starts listening. */
	start(server: McpServer): Promise<void>;
	/** Graceful stop. */
	stop(): Promise<void>;
}

/** Detect if running under Bun. */
export function isBun(): boolean {
	return typeof globalThis !== "undefined" && "Bun" in globalThis;
}

/**
 * Create a managed transport based on type and runtime.
 */
export async function createTransport(
	type: TransportType,
	options: TransportOptions,
): Promise<ManagedTransport> {
	switch (type) {
		case "stdio": {
			const { createStdioTransport } = await import("./stdio.js");
			return createStdioTransport();
		}
		case "http": {
			const { createHttpTransport } = await import("./http.js");
			return createHttpTransport(options);
		}
		case "ws": {
			const { createWsTransport } = await import("./ws.js");
			return createWsTransport(options);
		}
		default:
			throw new Error(`Unknown transport type: ${type as string}`);
	}
}
