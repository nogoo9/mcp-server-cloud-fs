// src/transports/ws.e2e.test.ts
//
// E2E integration test for the WebSocket transport.
// Uses in-memory provider so no external infrastructure is needed.
// Spawns the server as a child process on a random port and
// connects via Bun's native WebSocket with JSON-RPC framing.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Subprocess } from "bun";

const PORT = 18200 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/mcp`;

let proc: Subprocess | null = null;
let ws: WebSocket | null = null;

/** Incrementing JSON-RPC request ID */
let nextId = 1;

/** Map of pending request IDs → resolve/reject */
const pending = new Map<
	number,
	{ resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

/** Send a JSON-RPC request and wait for the matching response. */
function rpcCall(
	method: string,
	params?: Record<string, unknown>,
	timeoutMs = 10_000,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const id = nextId++;
		const msg = { jsonrpc: "2.0", id, method, params: params ?? {} };
		pending.set(id, { resolve, reject });
		ws!.send(JSON.stringify(msg));

		setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id);
				reject(
					new Error(`RPC ${method} (id=${id}) timed out after ${timeoutMs}ms`),
				);
			}
		}, timeoutMs);
	});
}

/** Wait for the HTTP healthz endpoint to return 200. */
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

/** Open WebSocket and wait for connection + initialize handshake. */
function connectWs(url: string, timeoutMs = 10_000): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error(`WebSocket connection to ${url} timed out`));
		}, timeoutMs);

		socket.addEventListener("open", () => {
			clearTimeout(timer);
			resolve(socket);
		});

		socket.addEventListener("error", (e) => {
			clearTimeout(timer);
			reject(new Error(`WebSocket error: ${e}`));
		});

		socket.addEventListener("message", (event) => {
			try {
				const data = JSON.parse(String(event.data));
				// Handle JSON-RPC response (has 'id')
				if (data.id != null && pending.has(data.id)) {
					const p = pending.get(data.id)!;
					pending.delete(data.id);
					if (data.error) {
						p.reject(
							new Error(data.error.message ?? JSON.stringify(data.error)),
						);
					} else {
						p.resolve(data.result);
					}
				}
				// Notifications (no id) are ignored
			} catch {
				// ignore parse errors
			}
		});
	});
}

describe("MCP e2e — WebSocket transport (memory provider)", () => {
	beforeAll(async () => {
		// Spawn the server as a child process with WS transport
		proc = Bun.spawn(
			[
				"bun",
				"run",
				"src/index.ts",
				"memory",
				"mem://e2e-ws",
				"--transport",
				"ws",
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

		// Wait for the server to be ready via healthz
		await waitForReady(BASE_URL);

		// Open WebSocket connection
		ws = await connectWs(WS_URL);

		// MCP initialize handshake
		await rpcCall("initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "ws-e2e-test", version: "1.0.0" },
		});

		// Send initialized notification (no response expected)
		ws.send(
			JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			}),
		);

		// Brief pause to let server process notification
		await Bun.sleep(100);
	});

	afterAll(async () => {
		ws?.close();
		ws = null;
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
		const result = (await rpcCall("tools/list")) as {
			tools: { name: string }[];
		};
		const names = result.tools.map((t) => t.name);
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
		const result = (await rpcCall("tools/call", {
			name: "read_file",
			arguments: { path: "mem://e2e-ws/README.md" },
		})) as { content: { type: string; text?: string }[] };
		const text = result.content?.[0]?.text ?? "";
		expect(text).toContain("Cloud FS Demo");
	});

	it("write_file + read_file round trip", async () => {
		await rpcCall("tools/call", {
			name: "write_file",
			arguments: {
				path: "mem://e2e-ws/test-ws.txt",
				content: "hello from ws transport",
			},
		});

		const result = (await rpcCall("tools/call", {
			name: "read_file",
			arguments: { path: "mem://e2e-ws/test-ws.txt" },
		})) as { content: { type: string; text?: string }[] };
		const text = result.content?.[0]?.text ?? "";
		expect(text).toBe("hello from ws transport");
	});

	it("list_directory shows files", async () => {
		const result = (await rpcCall("tools/call", {
			name: "list_directory",
			arguments: { path: "mem://e2e-ws/" },
		})) as { content: { type: string; text?: string }[] };
		const text = result.content?.[0]?.text ?? "";
		expect(text).toContain("README.md");
	});

	it("shell tool works over WebSocket", async () => {
		await rpcCall("tools/call", {
			name: "shell",
			arguments: {
				command: 'echo "ws works" > mem://e2e-ws/ws-test.txt',
			},
		});

		const result = (await rpcCall("tools/call", {
			name: "read_file",
			arguments: { path: "mem://e2e-ws/ws-test.txt" },
		})) as { content: { type: string; text?: string }[] };
		const text = result.content?.[0]?.text ?? "";
		expect(text).toContain("ws works");
	});

	it("edit_file works over WebSocket", async () => {
		await rpcCall("tools/call", {
			name: "write_file",
			arguments: {
				path: "mem://e2e-ws/edit-test.txt",
				content: "original content",
			},
		});
		await rpcCall("tools/call", {
			name: "edit_file",
			arguments: {
				path: "mem://e2e-ws/edit-test.txt",
				edits: [{ oldText: "original", newText: "modified" }],
			},
		});
		const result = (await rpcCall("tools/call", {
			name: "read_file",
			arguments: { path: "mem://e2e-ws/edit-test.txt" },
		})) as { content: { type: string; text?: string }[] };
		const text = result.content?.[0]?.text ?? "";
		expect(text).toBe("modified content");
	});
});
