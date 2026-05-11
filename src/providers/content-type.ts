// src/providers/content-type.ts
// Infer MIME content type from buffer magic bytes (via file-type), falling back to extension.

import { fileTypeFromBuffer } from "file-type";

/** Extension → MIME mapping for text and structured formats without magic numbers. */
const EXT_MAP: Record<string, string> = {
	// Text
	txt: "text/plain",
	md: "text/markdown",
	html: "text/html",
	htm: "text/html",
	css: "text/css",
	csv: "text/csv",
	tsv: "text/tab-separated-values",

	// Data / config
	json: "application/json",
	jsonl: "application/x-ndjson",
	xml: "application/xml",
	yaml: "text/yaml",
	yml: "text/yaml",
	toml: "application/toml",
	ini: "text/plain",
	env: "text/plain",

	// Code
	js: "application/javascript",
	mjs: "application/javascript",
	cjs: "application/javascript",
	ts: "application/typescript",
	tsx: "application/typescript",
	jsx: "application/javascript",
	py: "text/x-python",
	rb: "text/x-ruby",
	go: "text/x-go",
	rs: "text/x-rust",
	java: "text/x-java-source",
	c: "text/x-c",
	cpp: "text/x-c++src",
	h: "text/x-c",
	sh: "application/x-sh",
	bat: "application/x-msdos-program",
	ps1: "application/x-powershell",
	sql: "application/sql",

	// Images (fallback when magic bytes not available)
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	bmp: "image/bmp",
	tiff: "image/tiff",
	tif: "image/tiff",
	avif: "image/avif",

	// Documents
	pdf: "application/pdf",

	// Archives
	zip: "application/zip",
	gz: "application/gzip",
	tar: "application/x-tar",
	bz2: "application/x-bzip2",
	xz: "application/x-xz",
	zst: "application/zstd",
	"7z": "application/x-7z-compressed",

	// Audio/Video
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	flac: "audio/flac",
	mp4: "video/mp4",
	webm: "video/webm",
	avi: "video/x-msvideo",
	mkv: "video/x-matroska",

	// Fonts
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",

	// WebAssembly
	wasm: "application/wasm",
};

/**
 * Infer content type from buffer magic bytes, falling back to file extension.
 *
 * Uses the `file-type` library for robust magic-byte detection (100+ types).
 * Text formats (`.txt`, `.md`, `.json`, etc.) have no magic numbers —
 * they are handled by the extension fallback without raising an error.
 *
 * @param key  The object key / filename (used for extension lookup).
 * @param content  The file content buffer (used for magic-byte sniffing).
 * @returns A MIME type string, or `"application/octet-stream"` if unknown.
 */
export async function inferContentType(
	key: string,
	content: Buffer,
): Promise<string> {
	// 1. Try magic bytes via file-type (handles 100+ binary formats)
	if (content.length > 0) {
		const result = await fileTypeFromBuffer(content);
		if (result) return result.mime;
	}

	// 2. Fall back to extension (covers text, config, code, etc.)
	return fromExtension(key);
}

function fromExtension(key: string): string {
	const ext = key.split(".").pop()?.toLowerCase() ?? "";
	return EXT_MAP[ext] ?? "application/octet-stream";
}
