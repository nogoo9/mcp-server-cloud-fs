// src/tools/presigned.test.ts
import { describe, expect, it, mock } from "bun:test";
import { parseUri } from "../path-utils.js";
import { MemoryProvider } from "../providers/memory.js";
import { VirtualFS } from "../vfs.js";
import { makeCache } from "./__test-helpers.js";
import { handleGetPresignedUrl, registerPresignedTools } from "./presigned.js";

type T = { text: string };

// Behavioral context: uses real MemoryProvider + real VFS.
// MemoryProvider naturally lacks getPresignedUrl, testing the "unsupported" path.
function memCtx() {
	const provider = new MemoryProvider();
	const root = parseUri("mem://test-bucket");
	const vfs = new VirtualFS(provider, makeCache());
	return { vfs, roots: [root], provider: provider as MemoryProvider };
}

// For the happy-path, we extend MemoryProvider with a fake getPresignedUrl.
// This is the minimal mock needed: one method on a real provider instance.
function presignableCtx() {
	const provider = new MemoryProvider();
	const root = parseUri("mem://test-bucket");
	const vfs = new VirtualFS(provider, makeCache());
	// Augment with a presigning capability
	const augmented = provider as MemoryProvider & {
		getPresignedUrl: (...args: unknown[]) => Promise<string>;
	};
	augmented.getPresignedUrl = mock(
		async () => "https://storage.example.com/test-bucket/file.txt?token=abc123",
	);
	return { vfs, roots: [root], provider: augmented };
}

describe("handleGetPresignedUrl", () => {
	it("returns a presigned download URL when provider supports it", async () => {
		const result = await handleGetPresignedUrl(
			{ path: "mem://test-bucket/file.txt", expires_in: 600, operation: "get" },
			presignableCtx(),
		);
		expect(result.isError).toBeFalsy();
		const text = (result.content[0]! as T).text;
		expect(text).toContain("https://storage.example.com");
		expect(text).toContain("Presigned download URL");
		expect(text).toContain("10 minutes");
	});

	it("returns presigned upload URL for put operation", async () => {
		const result = await handleGetPresignedUrl(
			{
				path: "mem://test-bucket/upload.txt",
				expires_in: 300,
				operation: "put",
			},
			presignableCtx(),
		);
		expect(result.isError).toBeFalsy();
		expect((result.content[0]! as T).text).toContain("Presigned upload URL");
		expect((result.content[0]! as T).text).toContain("5 minutes");
	});

	it("returns clear error when provider does not support presigned URLs", async () => {
		// MemoryProvider naturally lacks getPresignedUrl — no mock needed
		const result = await handleGetPresignedUrl(
			{ path: "mem://test-bucket/file.txt", expires_in: 600, operation: "get" },
			memCtx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("not supported");
	});

	it("caps expires_in at 86400 seconds (24h)", async () => {
		const ctx = presignableCtx();
		let capturedOpts: { expiresIn: number } | undefined;
		ctx.provider.getPresignedUrl = mock(
			async (_root: unknown, _key: unknown, opts: unknown) => {
				capturedOpts = opts as { expiresIn: number };
				return "https://example.com/signed";
			},
		);
		await handleGetPresignedUrl(
			{
				path: "mem://test-bucket/file.txt",
				expires_in: 999999,
				operation: "get",
			},
			ctx,
		);
		expect(capturedOpts?.expiresIn).toBe(86_400);
	});

	it("returns error for path outside allowed roots", async () => {
		const result = await handleGetPresignedUrl(
			{ path: "mem://evil-bucket/file.txt", expires_in: 600, operation: "get" },
			presignableCtx(),
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Access denied");
	});

	it("returns error when provider.getPresignedUrl throws", async () => {
		const ctx = presignableCtx();
		ctx.provider.getPresignedUrl = mock(async () => {
			throw new Error("Credentials expired");
		});
		const result = await handleGetPresignedUrl(
			{ path: "mem://test-bucket/file.txt", expires_in: 600, operation: "get" },
			ctx,
		);
		expect(result.isError).toBe(true);
		expect((result.content[0]! as T).text).toContain("Credentials expired");
	});
});

describe("registerPresignedTools", () => {
	it("registers the get_presigned_url tool", () => {
		const registered: string[] = [];
		const mockServer = {
			registerTool: mock((name: string) => {
				registered.push(name);
			}),
		} as unknown as Parameters<typeof registerPresignedTools>[0];
		registerPresignedTools(mockServer, memCtx());
		expect(registered).toContain("get_presigned_url");
	});
});
