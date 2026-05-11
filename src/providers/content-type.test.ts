// src/providers/content-type.test.ts
import { describe, expect, it } from "bun:test";
import { inferContentType } from "./content-type.js";

describe("inferContentType", () => {
	// ── Magic-byte detection ───────────────────────────────────────────────
	it("detects PNG from magic bytes", () => {
		const png = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
		]);
		expect(inferContentType("image.png", png)).toBe("image/png");
	});

	it("detects PNG even with wrong extension", () => {
		const png = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
		]);
		expect(inferContentType("data.bin", png)).toBe("image/png");
	});

	it("detects JPEG from magic bytes", () => {
		const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
		expect(inferContentType("photo.jpg", jpg)).toBe("image/jpeg");
	});

	it("detects GIF from magic bytes", () => {
		const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
		expect(inferContentType("anim.gif", gif)).toBe("image/gif");
	});

	it("detects PDF from magic bytes", () => {
		const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
		expect(inferContentType("doc.pdf", pdf)).toBe("application/pdf");
	});

	it("detects ZIP from magic bytes", () => {
		const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
		expect(inferContentType("archive.zip", zip)).toBe("application/zip");
	});

	it("detects GZIP from magic bytes", () => {
		const gz = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
		expect(inferContentType("data.tar.gz", gz)).toBe("application/gzip");
	});

	it("detects WASM from magic bytes", () => {
		const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01]);
		expect(inferContentType("module.wasm", wasm)).toBe("application/wasm");
	});

	// ── RIFF disambiguation ────────────────────────────────────────────────
	it("detects WEBP via RIFF+WEBP subformat", () => {
		const buf = Buffer.alloc(12);
		buf.write("RIFF", 0, "ascii");
		buf.write("WEBP", 8, "ascii");
		expect(inferContentType("image.webp", buf)).toBe("image/webp");
	});

	it("detects WAV via RIFF+WAVE subformat", () => {
		const buf = Buffer.alloc(12);
		buf.write("RIFF", 0, "ascii");
		buf.write("WAVE", 8, "ascii");
		expect(inferContentType("audio.wav", buf)).toBe("audio/wav");
	});

	// ── Extension fallback (text formats — no magic bytes) ─────────────────
	it("falls back to extension for .txt", () => {
		expect(inferContentType("readme.txt", Buffer.from("hello world"))).toBe(
			"text/plain",
		);
	});

	it("falls back to extension for .md", () => {
		expect(inferContentType("README.md", Buffer.from("# Title"))).toBe(
			"text/markdown",
		);
	});

	it("falls back to extension for .json", () => {
		expect(inferContentType("data.json", Buffer.from('{"a":1}'))).toBe(
			"application/json",
		);
	});

	it("falls back to extension for .html", () => {
		expect(inferContentType("page.html", Buffer.from("<html></html>"))).toBe(
			"text/html",
		);
	});

	it("falls back to extension for .csv", () => {
		expect(inferContentType("data.csv", Buffer.from("a,b,c"))).toBe("text/csv");
	});

	it("falls back to extension for .yaml", () => {
		expect(inferContentType("config.yaml", Buffer.from("key: val"))).toBe(
			"text/yaml",
		);
	});

	it("falls back to extension for .ts", () => {
		expect(inferContentType("app.ts", Buffer.from("const x = 1;"))).toBe(
			"application/typescript",
		);
	});

	it("falls back to extension for .py", () => {
		expect(inferContentType("script.py", Buffer.from("print('hi')"))).toBe(
			"text/x-python",
		);
	});

	it("falls back to extension for .svg (no magic, XML-based)", () => {
		expect(inferContentType("icon.svg", Buffer.from("<svg></svg>"))).toBe(
			"image/svg+xml",
		);
	});

	// ── Empty content ──────────────────────────────────────────────────────
	it("handles empty buffer gracefully (uses extension)", () => {
		expect(inferContentType("notes.txt", Buffer.alloc(0))).toBe("text/plain");
	});

	it("handles empty buffer with unknown extension", () => {
		expect(inferContentType("data.xyz", Buffer.alloc(0))).toBe(
			"application/octet-stream",
		);
	});

	// ── No extension, no magic ─────────────────────────────────────────────
	it("returns octet-stream for unknown content", () => {
		expect(inferContentType("Makefile", Buffer.from("all:\n\techo hi"))).toBe(
			"application/octet-stream",
		);
	});
});
