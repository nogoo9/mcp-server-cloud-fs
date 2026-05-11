// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ParsedRoot } from "./providers/interface.js";
import { registerDirectoryTools } from "./tools/directory.js";
import { registerExtendedTools } from "./tools/extended.js";
import { registerInfoTools } from "./tools/info.js";
import { registerMoveTools } from "./tools/move.js";
import { registerReadTools } from "./tools/read.js";
import { registerSearchTools } from "./tools/search.js";
import { registerWriteTools } from "./tools/write.js";
import type { VirtualFS } from "./vfs.js";

export interface ServerContext {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	/** Enable the delete_file tool. Default: false. */
	enableDelete?: boolean;
	/** Maximum number of objects grep_files will scan per call. Default: 1000. */
	grepMaxObjects?: number;
}

export function createMcpServer(ctx: ServerContext): McpServer {
	const server = new McpServer({
		name: "mcp-server-cloud-fs",
		version: "0.2.0",
	});

	registerReadTools(server, ctx);
	registerWriteTools(server, ctx);
	registerDirectoryTools(server, ctx);
	registerMoveTools(server, ctx);
	registerSearchTools(server, ctx);
	registerInfoTools(server, ctx);
	registerExtendedTools(server, ctx);

	return server;
}
