// src/providers/content-type.ts
// Infer MIME content type from buffer magic bytes, falling back to file extension.

/**
 * Magic-number signatures.
 * Each entry: [byte-offset, expected-bytes, mime-type].
 * Checked in order — first match wins.
 */
const MAGIC: ReadonlyArray<readonly [number, Uint8Array, string]> = [
	// Images
	[
		0,
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		"image/png",
	],
	[0, new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"],
	[0, new Uint8Array([0x47, 0x49, 0x46, 0x38]), "image/gif"],
	[0, new Uint8Array([0x52, 0x49, 0x46, 0x46]), "image/webp"], // RIFF header (also used by WAV)
	[0, new Uint8Array([0x00, 0x00, 0x01, 0x00]), "image/x-icon"], // ICO
	[0, new Uint8Array([0x00, 0x00, 0x02, 0x00]), "image/x-icon"], // CUR

	// Documents
	[0, new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf"], // %PDF

	// Archives
	[0, new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/zip"], // PK\x03\x04
	[0, new Uint8Array([0x1f, 0x8b]), "application/gzip"],
	[0, new Uint8Array([0x42, 0x5a, 0x68]), "application/x-bzip2"], // BZh
	[0, new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]), "application/x-xz"],
	[0, new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]), "application/zstd"],

	// Audio/Video
	[0, new Uint8Array([0x49, 0x44, 0x33]), "audio/mpeg"], // ID3 tag
	[0, new Uint8Array([0xff, 0xfb]), "audio/mpeg"], // MP3 sync word
	[0, new Uint8Array([0x4f, 0x67, 0x67, 0x53]), "audio/ogg"], // OggS
	[4, new Uint8Array([0x66, 0x74, 0x79, 0x70]), "video/mp4"], // ftyp (offset 4)

	// Executables / binaries
	[0, new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), "application/x-elf"], // ELF
	[0, new Uint8Array([0x4d, 0x5a]), "application/x-msdownload"], // MZ (PE)
	[0, new Uint8Array([0xce, 0xfa, 0xed, 0xfe]), "application/x-mach-binary"], // Mach-O 32
	[0, new Uint8Array([0xcf, 0xfa, 0xed, 0xfe]), "application/x-mach-binary"], // Mach-O 64

	// WebAssembly
	[0, new Uint8Array([0x00, 0x61, 0x73, 0x6d]), "application/wasm"],

	// SQLite
	[0, new TextEncoder().encode("SQLite format 3\0"), "application/x-sqlite3"],
];

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

	// Images (fallback when magic bytes are insufficient)
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
 * Text formats (`.txt`, `.md`, `.json`, etc.) have no magic numbers —
 * they are handled by the extension fallback without raising an error.
 *
 * @param key  The object key / filename (used for extension lookup).
 * @param content  The file content buffer (used for magic-byte sniffing).
 * @returns A MIME type string, or `"application/octet-stream"` if unknown.
 */
export function inferContentType(key: string, content: Buffer): string {
	// 1. Try magic bytes
	for (const [offset, sig, mime] of MAGIC) {
		if (content.length >= offset + sig.length) {
			let match = true;
			for (let i = 0; i < sig.length; i++) {
				if (content[offset + i] !== sig[i]) {
					match = false;
					break;
				}
			}
			if (match) {
				// Special case: RIFF can be WAV or WEBP — check sub-format at offset 8
				if (mime === "image/webp" && content.length >= 12) {
					const sub = content.subarray(8, 12).toString("ascii");
					if (sub === "WAVE") return "audio/wav";
					if (sub !== "WEBP") return fromExtension(key); // unknown RIFF variant
				}
				return mime;
			}
		}
	}

	// 2. Fall back to extension (covers text, config, code, etc.)
	return fromExtension(key);
}

function fromExtension(key: string): string {
	const ext = key.split(".").pop()?.toLowerCase() ?? "";
	return EXT_MAP[ext] ?? "application/octet-stream";
}
