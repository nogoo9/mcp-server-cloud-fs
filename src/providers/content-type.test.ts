// src/providers/content-type.test.ts
import { describe, expect, it } from "bun:test";
import { inferContentType } from "./content-type.js";

describe("inferContentType", () => {
	// ── Magic-byte detection (via file-type) ────────────────────────────────
	it("detects PNG from magic bytes", async () => {
		const png = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
		]);
		expect(await inferContentType("image.png", png)).toBe("image/png");
	});

	it("detects PNG even with wrong extension", async () => {
		// file-type needs enough bytes to confirm the format — use the same buffer
		const png = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
			0x49, 0x48, 0x44, 0x52,
		]);
		expect(await inferContentType("data.bin", png)).toBe("image/png");
	});

	it("falls back to extension when buffer is too short for magic detection", async () => {
		// Only 4 bytes — file-type can't confirm PNG from just the start
		const partial = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		expect(await inferContentType("photo.png", partial)).toBe("image/png");
	});

	it("detects JPEG from magic bytes", async () => {
		const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
		expect(await inferContentType("photo.jpg", jpg)).toBe("image/jpeg");
	});

	it("detects GIF from magic bytes", async () => {
		const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
		expect(await inferContentType("anim.gif", gif)).toBe("image/gif");
	});

	it("detects PDF from magic bytes", async () => {
		const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
		expect(await inferContentType("doc.pdf", pdf)).toBe("application/pdf");
	});

	it("detects ZIP from magic bytes", async () => {
		const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
		expect(await inferContentType("archive.zip", zip)).toBe("application/zip");
	});

	it("detects GZIP from magic bytes", async () => {
		const gz = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
		expect(await inferContentType("data.tar.gz", gz)).toBe("application/gzip");
	});

	it("detects WASM from magic bytes", async () => {
		const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01]);
		expect(await inferContentType("module.wasm", wasm)).toBe(
			"application/wasm",
		);
	});

	it("detects WEBP from magic bytes", async () => {
		const buf = Buffer.alloc(12);
		buf.write("RIFF", 0, "ascii");
		buf.writeUInt32LE(0, 4); // file size placeholder
		buf.write("WEBP", 8, "ascii");
		expect(await inferContentType("image.webp", buf)).toBe("image/webp");
	});

	// ── Extension fallback (text formats — no magic bytes) ─────────────────
	it("falls back to extension for .txt", async () => {
		expect(
			await inferContentType("readme.txt", Buffer.from("hello world")),
		).toBe("text/plain");
	});

	it("falls back to extension for .md", async () => {
		expect(await inferContentType("README.md", Buffer.from("# Title"))).toBe(
			"text/markdown",
		);
	});

	it("falls back to extension for .json", async () => {
		expect(await inferContentType("data.json", Buffer.from('{"a":1}'))).toBe(
			"application/json",
		);
	});

	it("falls back to extension for .html", async () => {
		expect(
			await inferContentType("page.html", Buffer.from("<html></html>")),
		).toBe("text/html");
	});

	it("falls back to extension for .csv", async () => {
		expect(await inferContentType("data.csv", Buffer.from("a,b,c"))).toBe(
			"text/csv",
		);
	});

	it("falls back to extension for .yaml", async () => {
		expect(await inferContentType("config.yaml", Buffer.from("key: val"))).toBe(
			"text/yaml",
		);
	});

	it("falls back to extension for .ts", async () => {
		expect(await inferContentType("app.ts", Buffer.from("const x = 1;"))).toBe(
			"application/typescript",
		);
	});

	it("falls back to extension for .py", async () => {
		expect(
			await inferContentType("script.py", Buffer.from("print('hi')")),
		).toBe("text/x-python");
	});

	it("falls back to extension for .svg (no magic, XML-based)", async () => {
		expect(await inferContentType("icon.svg", Buffer.from("<svg></svg>"))).toBe(
			"image/svg+xml",
		);
	});

	// ── Empty content ──────────────────────────────────────────────────────
	it("handles empty buffer gracefully (uses extension)", async () => {
		expect(await inferContentType("notes.txt", Buffer.alloc(0))).toBe(
			"text/plain",
		);
	});

	it("handles empty buffer with unknown extension", async () => {
		expect(await inferContentType("data.xyz", Buffer.alloc(0))).toBe(
			"application/octet-stream",
		);
	});

	// ── No extension, no magic ─────────────────────────────────────────────
	it("returns octet-stream for unknown content", async () => {
		expect(
			await inferContentType("Makefile", Buffer.from("all:\n\techo hi")),
		).toBe("application/octet-stream");
	});
});
