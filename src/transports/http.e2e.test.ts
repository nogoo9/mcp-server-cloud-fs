// src/transports/http.e2e.test.ts
//
// E2E integration test for the Streamable HTTP transport.
// Uses in-memory provider so no external infrastructure is needed.
// Spawns the server as a child process on a random port and
// connects via the SDK's StreamableHTTPClientTransport.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomInt } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Subprocess } from "bun";

const PORT = 19384 + randomInt(1000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let proc: Subprocess | null = null;
let client: Client | null = null;

async function waitForReady(url: string, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const r = await fetch(`${url}/healthz`, {
				signal: AbortSignal.timeout(500),
			});
			if (r.ok) return;
		} catch {
			// not ready yet
		}
		await Bun.sleep(100);
	}
	throw new Error(
		`Server at ${url} did not become ready within ${timeoutMs}ms`,
	);
}

describe("MCP e2e — HTTP transport (memory provider)", () => {
	beforeAll(async () => {
		// Spawn the server as a child process
		proc = Bun.spawn(
			[
				"bun",
				"run",
				"src/index.ts",
				"memory",
				"mem://e2e-http",
				"--transport",
				"http",
				"--port",
				String(PORT),
				"--host",
				"127.0.0.1",
				"--enable-shell",
				"--seed-demo",
			],
			{
				stdout: "ignore",
				stderr: "pipe",
			},
		);

		// Wait for the server to be ready
		await waitForReady(BASE_URL);

		// Connect MCP client
		const transport = new StreamableHTTPClientTransport(
			new URL(`${BASE_URL}/mcp`),
		);
		client = new Client({ name: "http-e2e-test", version: "1.0.0" });
		await client.connect(transport as Parameters<typeof client.connect>[0]);
	});

	afterAll(async () => {
		try {
			await client?.close();
		} catch {
			/* ignore */
		}
		proc?.kill();
		proc = null;
	});

	it("healthz returns ok", async () => {
		const r = await fetch(`${BASE_URL}/healthz`);
		expect(r.status).toBe(200);
		const body = (await r.json()) as { status: string };
		expect(body.status).toBe("ok");
	});

	it("readyz returns ready", async () => {
		const r = await fetch(`${BASE_URL}/readyz`);
		expect(r.status).toBe(200);
		const body = (await r.json()) as { status: string };
		expect(body.status).toBe("ready");
	});

	it("404 on unknown path", async () => {
		const r = await fetch(`${BASE_URL}/nonexistent`);
		expect(r.status).toBe(404);
	});

	it("listTools returns expected tool names", async () => {
		const { tools } = await client!.listTools();
		const names = tools.map((t) => t.name);
		for (const n of [
			"write_file",
			"read_file",
			"list_directory",
			"get_file_info",
			"shell",
		]) {
			expect(names).toContain(n);
		}
	});

	it("read_file reads seeded demo content", async () => {
		const r = await client!.callTool({
			name: "read_file",
			arguments: { path: "mem://e2e-http/README.md" },
		});
		const text =
			(r.content as { type: string; text?: string }[])?.[0]?.text ?? "";
		expect(text).toContain("Cloud FS Demo");
	});

	it("write_file + read_file round trip", async () => {
		await client!.callTool({
			name: "write_file",
			arguments: {
				path: "mem://e2e-http/test-http.txt",
				content: "hello from http transport",
			},
		});

		const r = await client!.callTool({
			name: "read_file",
			arguments: { path: "mem://e2e-http/test-http.txt" },
		});
		const text =
			(r.content as { type: string; text?: string }[])?.[0]?.text ?? "";
		expect(text).toBe("hello from http transport");
	});

	it("list_directory shows files", async () => {
		const r = await client!.callTool({
			name: "list_directory",
			arguments: { path: "mem://e2e-http/" },
		});
		const text =
			(r.content as { type: string; text?: string }[])?.[0]?.text ?? "";
		expect(text).toContain("README.md");
	});

	it("shell tool works over HTTP", async () => {
		const r = await client!.callTool({
			name: "shell",
			arguments: {
				command: 'echo "http works" > mem://e2e-http/http-test.txt',
			},
		});
		const text =
			(r.content as { type: string; text?: string }[])?.[0]?.text ?? "";
		expect(text).toBe("");

		const r2 = await client!.callTool({
			name: "read_file",
			arguments: { path: "mem://e2e-http/http-test.txt" },
		});
		const text2 =
			(r2.content as { type: string; text?: string }[])?.[0]?.text ?? "";
		expect(text2).toContain("http works");
	});

	it("edit_file works over HTTP", async () => {
		await client!.callTool({
			name: "write_file",
			arguments: {
				path: "mem://e2e-http/edit-test.txt",
				content: "original content",
			},
		});
		await client!.callTool({
			name: "edit_file",
			arguments: {
				path: "mem://e2e-http/edit-test.txt",
				edits: [{ oldText: "original", newText: "modified" }],
			},
		});
		const r = await client!.callTool({
			name: "read_file",
			arguments: { path: "mem://e2e-http/edit-test.txt" },
		});
		const text =
			(r.content as { type: string; text?: string }[])?.[0]?.text ?? "";
		expect(text).toBe("modified content");
	});
});
