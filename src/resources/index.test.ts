// src/resources/index.test.ts
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseUri } from "../path-utils.js";
import { MemoryProvider } from "../providers/memory.js";
import { makeCache } from "../tools/__test-helpers.js";
import { VirtualFS } from "../vfs.js";
import type { ServerContext } from "../server.js";
import { registerResources } from "./index.js";

async function createCtx() {
	const provider = new MemoryProvider();
	const root = parseUri("mem://res-test");
	const vfs = new VirtualFS(provider, makeCache());

	await provider.putObject(root, "readme.md", Buffer.from("# Hello"));
	await provider.putObject(
		root,
		"data/report.csv",
		Buffer.from("a,b,c\n1,2,3"),
	);

	const ctx: ServerContext = {
		vfs,
		roots: [root],
		provider,
	};
	return ctx;
}

describe("registerResources", () => {
	it("registers without errors", async () => {
		const ctx = await createCtx();
		const server = new McpServer({
			name: "test",
			version: "0.0.0",
		});
		// Should not throw
		registerResources(server, ctx);
	});

	it("registers a static root resource for each root", async () => {
		const ctx = await createCtx();
		const server = new McpServer({
			name: "test",
			version: "0.0.0",
		});
		registerResources(server, ctx);

		// Verify by checking that the internal resources registry has entries.
		// McpServer uses a Map internally keyed by resource URI.
		// biome-ignore lint/suspicious/noExplicitAny: accessing internal McpServer state for testing
		const registered = (server as any)._registeredResources;
		expect(registered).toBeDefined();
		// Check it's non-empty (works for Map, object, or similar)
		const keys =
			registered instanceof Map
				? [...registered.keys()]
				: Object.keys(registered);
		expect(keys.length).toBeGreaterThanOrEqual(1);
	});

	it("registers a resource template for browsing", async () => {
		const ctx = await createCtx();
		const server = new McpServer({
			name: "test",
			version: "0.0.0",
		});
		registerResources(server, ctx);

		// biome-ignore lint/suspicious/noExplicitAny: accessing internal McpServer state for testing
		const templates = (server as any)._registeredResourceTemplates;
		expect(templates).toBeDefined();
		const keys =
			templates instanceof Map
				? [...templates.keys()]
				: Object.keys(templates);
		expect(keys.length).toBeGreaterThanOrEqual(1);
	});
});
