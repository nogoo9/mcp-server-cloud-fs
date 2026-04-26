// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CacheStore } from "./cache/interface.js";
import type { ParsedRoot, StorageProvider } from "./providers/interface.js";
import { registerDirectoryTools } from "./tools/directory.js";
import { registerInfoTools } from "./tools/info.js";
import { registerMoveTools } from "./tools/move.js";
import { registerReadTools } from "./tools/read.js";
import { registerSearchTools } from "./tools/search.js";
import { registerWriteTools } from "./tools/write.js";

export interface ServerContext {
	provider: StorageProvider;
	cache: CacheStore;
	roots: ParsedRoot[];
}

export function createMcpServer(ctx: ServerContext): McpServer {
	const server = new McpServer({
		name: "mcp-server-cloud-fs",
		version: "0.1.0",
	});

	registerReadTools(server, ctx);
	registerWriteTools(server, ctx);
	registerDirectoryTools(server, ctx);
	registerMoveTools(server, ctx);
	registerSearchTools(server, ctx);
	registerInfoTools(server, ctx);

	return server;
}
