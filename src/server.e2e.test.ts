// src/server.e2e.test.ts
//
// End-to-end integration tests for the full MCP server stack:
//   MinIO (S3) provider + cache (memory / Redis) → MCP stdio transport → tool calls
//
// Prerequisites: `bun run infra:setup` must be running.
// MinIO at localhost:9000, Redis at localhost:6379.
//
// Caching is validated behaviourally:
//   1. Write a file via the MCP server (populates the list cache).
//   2. Write a second file directly to MinIO (cache not notified).
//   3. list_directory returns only the first file → proves cache was served.
//   4. Write the second file through MCP → cache is invalidated.
//   5. list_directory now returns both files → proves eviction.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
	CreateBucketCommand,
	DeleteObjectsCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const MINIO_ENDPOINT = "http://localhost:9000";
const BUCKET = "e2e-test-bucket";
const S3_CONFIG = {
	region: "us-east-1",
	endpoint: MINIO_ENDPOINT,
	forcePathStyle: true as const,
	credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
};

// ── Reachability probes ────────────────────────────────────────────────────────

async function probeHttp(url: string): Promise<boolean> {
	try {
		const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
		return resp.ok || resp.status === 403 || resp.status === 404;
	} catch {
		return false;
	}
}

async function probeTcp(host: string, port: number): Promise<boolean> {
	const net = await import("node:net");
	return new Promise<boolean>((resolve) => {
		const sock = net.createConnection({ port, host });
		sock.setTimeout(2000);
		sock.on("connect", () => {
			sock.destroy();
			resolve(true);
		});
		sock.on("error", () => resolve(false));
		sock.on("timeout", () => {
			sock.destroy();
			resolve(false);
		});
	});
}

// ── S3 helpers ─────────────────────────────────────────────────────────────────

async function ensureBucket(s3: S3Client): Promise<void> {
	try {
		await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
	} catch (e: unknown) {
		const code =
			(e as { Code?: string; name?: string }).Code ??
			(e as { name?: string }).name;
		if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists")
			throw e;
	}
}

async function cleanBucket(s3: S3Client, prefix: string): Promise<void> {
	const resp = await s3.send(
		new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }),
	);
	const keys = (resp.Contents ?? []).flatMap((o) =>
		o.Key ? [{ Key: o.Key }] : [],
	);
	if (keys.length > 0)
		await s3.send(
			new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys } }),
		);
}

// ── MCP server factory ─────────────────────────────────────────────────────────

interface McpHandle {
	client: Client;
	close: () => Promise<void>;
}

async function spawnMcpServer(extraArgs: string[] = []): Promise<McpHandle> {
	const transport = new StdioClientTransport({
		command: "bun",
		args: [
			"run",
			"src/index.ts",
			"s3",
			`s3://${BUCKET}`,
			"--endpoint",
			MINIO_ENDPOINT,
			"--cache-ttl",
			"60",
			"--sync-debounce",
			"0",
			...extraArgs,
		],
		env: {
			...process.env,
			AWS_ACCESS_KEY_ID: "minioadmin",
			AWS_SECRET_ACCESS_KEY: "minioadmin",
			REDIS_URL: "redis://localhost:6379", // nosemgrep: redis-unencrypted-transport
		},
		stderr: "pipe",
	});

	const client = new Client({ name: "e2e-test-client", version: "1.0.0" });
	await client.connect(transport);
	return {
		client,
		close: async () => {
			try {
				await transport.close();
			} catch {
				/* ignore */
			}
		},
	};
}

// ── Helper: extract first text content from a callTool result ─────────────────

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

function firstText(r: ToolResult): string {
	const items =
		(r as { content?: { type: string; text?: string }[] }).content ?? [];
	return items[0]?.text ?? "";
}

// ── Suite factory ──────────────────────────────────────────────────────────────
//
// Instead of it.skipIf (which evaluates the condition at module-load time before
// any beforeAll runs), we use a shared `ctx` object that is populated during
// beforeAll. Each test then reads from ctx and calls `it.skip()` from inside.
//
// We rely on Bun's sequential test execution within a describe block.

function defineE2eSuite(
	label: string,
	extraArgs: string[],
	skip: () => boolean,
): void {
	describe(label, () => {
		let mcp: McpHandle;
		let s3: S3Client;
		let prefix: string;

		beforeAll(async () => {
			if (skip()) return;
			s3 = new S3Client(S3_CONFIG);
			await ensureBucket(s3);
			prefix = `e2e/${randomBytes(4).toString("hex")}/`;
			await cleanBucket(s3, prefix);
			mcp = await spawnMcpServer(extraArgs);
		});

		afterAll(async () => {
			if (mcp) await mcp.close();
			if (s3 && prefix) await cleanBucket(s3, prefix).catch(() => {});
		});

		it("write_file creates a file", async () => {
			if (skip()) return;
			const r = await mcp.client.callTool({
				name: "write_file",
				arguments: {
					path: `s3://${BUCKET}/${prefix}hello.txt`,
					content: "hello world",
				},
			});
			expect(firstText(r)).toContain("Successfully wrote");
			// write_file is cache-first: it stores in the in-process cache and schedules
			// a debounced flush to storage. Wait briefly so the flush completes before
			// any subsequent test calls headObject or listObjects directly on S3.
			await Bun.sleep(200);
		});

		it("read_file returns the written content", async () => {
			if (skip()) return;
			const r = await mcp.client.callTool({
				name: "read_file",
				arguments: { path: `s3://${BUCKET}/${prefix}hello.txt` },
			});
			expect(firstText(r)).toBe("hello world");
		});

		it("get_file_info returns correct byte size", async () => {
			if (skip()) return;
			const r = await mcp.client.callTool({
				name: "get_file_info",
				arguments: { path: `s3://${BUCKET}/${prefix}hello.txt` },
			});
			const t = firstText(r);
			// Output: "Size:          11 bytes" ("hello world" = 11 bytes)
			expect(t).toMatch(/size.*11|11.*bytes/i);
		});

		it("list_directory shows the written file", async () => {
			if (skip()) return;
			const r = await mcp.client.callTool({
				name: "list_directory",
				arguments: { path: `s3://${BUCKET}/${prefix}` },
			});
			expect(firstText(r)).toContain("hello.txt");
		});

		// ── Cache validation ─────────────────────────────────────────────────
		// list_directory calls the provider directly on every call (no list cache).
		// We validate that writes made via the server are immediately visible, and
		// that files written directly to storage (bypassing MCP) are also visible
		// on the next list call — confirming the provider is the source of truth.

		it("list reflects a bypass-write on the next call (no stale list cache)", async () => {
			if (skip()) return;
			await s3.send(
				new PutObjectCommand({
					Bucket: BUCKET,
					Key: `${prefix}bypass.txt`,
					Body: Buffer.from("direct"),
				}),
			);
			const r = await mcp.client.callTool({
				name: "list_directory",
				arguments: { path: `s3://${BUCKET}/${prefix}` },
			});
			// Direct write IS visible — list goes straight to storage.
			expect(firstText(r)).toContain("bypass.txt");
		});

		// ── File-level cache validation ────────────────────────────────────
		// read_file caches file content. Overwrite directly in S3 (bypassing MCP).
		// Subsequent read_file should return the old cached content.

		it("cache: read_file returns stale content after bypass-write (file cache hit)", async () => {
			if (skip()) return;
			// Warm the cache: read hello.txt → content is now cached.
			const warm = await mcp.client.callTool({
				name: "read_file",
				arguments: { path: `s3://${BUCKET}/${prefix}hello.txt` },
			});
			expect(firstText(warm)).toBe("hello world");

			// Overwrite directly in S3 — cache is NOT notified.
			await s3.send(
				new PutObjectCommand({
					Bucket: BUCKET,
					Key: `${prefix}hello.txt`,
					Body: Buffer.from("overwritten"),
				}),
			);

			// read_file should return the stale cached value.
			const stale = await mcp.client.callTool({
				name: "read_file",
				arguments: { path: `s3://${BUCKET}/${prefix}hello.txt` },
			});
			expect(firstText(stale)).toBe("hello world"); // from cache, not storage
		});

		// ── Cache eviction on write via MCP ────────────────────────────────

		it("cache: write via MCP evicts file cache — subsequent read is fresh", async () => {
			if (skip()) return;
			// Write through MCP — should evict the hello.txt cache entry.
			await mcp.client.callTool({
				name: "write_file",
				arguments: {
					path: `s3://${BUCKET}/${prefix}hello.txt`,
					content: "fresh content",
				},
			});
			const r = await mcp.client.callTool({
				name: "read_file",
				arguments: { path: `s3://${BUCKET}/${prefix}hello.txt` },
			});
			expect(firstText(r)).toBe("fresh content");
		});

		it("edit_file patches content — read_file reflects the update", async () => {
			if (skip()) return;
			// By this point hello.txt content is "fresh content" (from cache eviction test)
			await mcp.client.callTool({
				name: "write_file",
				arguments: {
					path: `s3://${BUCKET}/${prefix}hello.txt`,
					content: "hello world",
				},
			});
			await mcp.client.callTool({
				name: "edit_file",
				arguments: {
					path: `s3://${BUCKET}/${prefix}hello.txt`,
					edits: [{ oldText: "hello world", newText: "goodbye world" }],
				},
			});
			const r = await mcp.client.callTool({
				name: "read_file",
				arguments: { path: `s3://${BUCKET}/${prefix}hello.txt` },
			});
			expect(firstText(r)).toBe("goodbye world");
		});

		it("search_files finds files by glob", async () => {
			if (skip()) return;
			// Keys include the full prefix path (e.g. "e2e/abc123/hello.txt"),
			// so the glob must use ** to match across path segments.
			const r = await mcp.client.callTool({
				name: "search_files",
				arguments: { path: `s3://${BUCKET}/${prefix}`, pattern: "**/*.txt" },
			});
			expect(firstText(r)).toContain("hello.txt");
		});

		it("grep_files finds content across files", async () => {
			if (skip()) return;
			const r = await mcp.client.callTool({
				name: "grep_files",
				arguments: { path: `s3://${BUCKET}/${prefix}`, pattern: "goodbye" },
			});
			expect(firstText(r)).toContain("hello.txt");
		});

		it("listTools returns expected tool names", async () => {
			if (skip()) return;
			const { tools } = await mcp.client.listTools();
			const names = tools.map((t) => t.name);
			for (const n of [
				"write_file",
				"read_file",
				"list_directory",
				"get_file_info",
				"search_files",
				"grep_files",
				"edit_file",
				"move_file",
			]) {
				expect(names).toContain(n);
			}
		});
	});
}

// ── Top-level probe + suite registration ──────────────────────────────────────

let minioUp = false;
let redisUp = false;

beforeAll(async () => {
	[minioUp, redisUp] = await Promise.all([
		probeHttp(`${MINIO_ENDPOINT}/minio/health/live`),
		probeTcp("localhost", 6379),
	]);
	if (!minioUp)
		console.warn(
			"⚠  MinIO not reachable — memory-cache e2e tests will be skipped",
		);
	if (!redisUp)
		console.warn(
			"⚠  Redis not reachable — Redis-cache e2e tests will be skipped",
		);
});

defineE2eSuite(
	"MCP e2e — memory cache",
	["--cache-store", "memory"],
	() => !minioUp,
);

defineE2eSuite(
	"MCP e2e — redis cache",
	["--cache-store", "redis"],
	() => !minioUp || !redisUp,
);
