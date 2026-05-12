// src/transports/stdio.ts
// STDIO transport — wraps the SDK's StdioServerTransport for the ManagedTransport interface.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ManagedTransport } from "./index.js";

export function createStdioTransport(): ManagedTransport {
	const transport = new StdioServerTransport();

	return {
		transport,
		async start(server: McpServer) {
			await server.connect(transport);
		},
		async stop() {
			await transport.close();
		},
	};
}
