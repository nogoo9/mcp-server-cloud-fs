// src/path-utils.ts
import type { ParsedRoot } from "./providers/interface.js";

/**
 * Parse a cloud URI string into its component parts.
 *
 * Supported schemes: `s3://`, `az://`, `gs://`, `mem://`, `sqlite://`.
 *
 * @param uri - Cloud URI, e.g. `"s3://my-bucket/prefix"`.
 * @returns Parsed root with scheme, bucket, prefix, and original URI.
 * @throws If the URI does not match a supported scheme.
 *
 * @category Utilities
 */
export function parseUri(uri: string): ParsedRoot {
	const m = uri.match(/^(s3|az|gs|mem|sqlite):\/\/([^/]+)(?:\/(.*))?$/);
	if (!m) throw new Error(`Invalid cloud URI: ${uri}`);
	const scheme = m[1] as ParsedRoot["scheme"];
	const bucket = m[2]!;
	const rawPrefix = m[3] ?? "";
	const prefix = rawPrefix.replace(/\/$/, "");
	return { scheme, bucket, prefix, uri };
}

/** Collapses `.` and `..` segments; removes empty segments from double slashes. */
function normalizeKey(key: string): string {
	const stack: string[] = [];
	for (const part of key.split("/")) {
		if (part === "..") {
			stack.pop();
		} else if (part !== "" && part !== ".") {
			stack.push(part);
		}
	}
	return stack.join("/");
}

/**
 * Returns true if the given path string contains a URI scheme prefix
 * (e.g. "s3://", "mem://", "az://").
 */
function isAbsoluteUri(path: string): boolean {
	// URI scheme per RFC 3986: letter followed by letters, digits, +, -, .
	// We only allow the simple [a-z][a-z0-9]* subset used by our providers
	// (s3://, az://, gs://, mem://, sqlite://).
	return /^[a-z][a-z0-9]*:\/\//.test(path);
}

/**
 * Resolve a relative path against a root's prefix, then normalise.
 * A leading "/" is stripped — it means "root-relative" not filesystem root.
 */
function resolveRelative(root: ParsedRoot, relativePath: string): string {
	const stripped = relativePath.replace(/^\/+/, "");
	const base = root.prefix ? `${root.prefix}/${stripped}` : stripped;
	return normalizeKey(base);
}

/**
 * Resolve a tool path (relative or absolute URI) against allowed roots.
 *
 * Validates that the resolved path falls within at least one configured root.
 * Throws `"Access denied: path is outside allowed roots"` on violation.
 *
 * @param allowedRoots - Configured storage roots to validate against.
 * @param toolPath - User-supplied path (relative or absolute URI).
 * @returns The matching root and the normalized key.
 *
 * @category Utilities
 */
export function resolveToolPath(
	allowedRoots: ParsedRoot[],
	toolPath: string,
): { root: ParsedRoot; key: string } {
	// ── Relative path: no scheme prefix ────────────────────────────────────
	if (!isAbsoluteUri(toolPath)) {
		if (allowedRoots.length === 0) {
			throw new Error("Access denied: no roots configured");
		}
		// Always resolve against the first root (the "working" root in TUI mode)
		const root = allowedRoots[0]!;
		const key = resolveRelative(root, toolPath);

		// Security: still enforce prefix confinement after resolution
		const withinRoot =
			root.prefix === "" ||
			key === root.prefix ||
			key.startsWith(`${root.prefix}/`);

		if (!withinRoot) {
			throw new Error("Access denied: path is outside allowed roots");
		}

		return { root, key };
	}

	// ── Absolute URI: existing behaviour ───────────────────────────────────
	const parsed = parseUri(toolPath);
	const normalizedKey = normalizeKey(parsed.prefix);

	for (const root of allowedRoots) {
		if (root.scheme !== parsed.scheme || root.bucket !== parsed.bucket)
			continue;

		const withinRoot =
			root.prefix === "" ||
			normalizedKey === root.prefix ||
			normalizedKey.startsWith(`${root.prefix}/`);

		if (!withinRoot) continue;

		return { root, key: normalizedKey };
	}

	throw new Error("Access denied: path is outside allowed roots");
}

/**
 * Build a canonical cache key from a root and normalized object key.
 *
 * @param root - Parsed storage root.
 * @param key - Pre-normalized object key (from {@link resolveToolPath}).
 * @returns Cache key string in the format `scheme://bucket/key`.
 *
 * @category Utilities
 */
export function toCacheKey(root: ParsedRoot, key: string): string {
	return `${root.scheme}://${root.bucket}/${key}`;
}
