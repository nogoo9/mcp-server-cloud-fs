// src/path-utils.ts
import type { ParsedRoot } from "./providers/interface.js";

export function parseUri(uri: string): ParsedRoot {
	const m = uri.match(/^(s3|az|gs):\/\/([^/]+)(?:\/(.*))?$/);
	if (!m) throw new Error(`Invalid cloud URI: ${uri}`);
	const scheme = m[1] as "s3" | "az" | "gs";
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

export function resolveToolPath(
	allowedRoots: ParsedRoot[],
	toolPath: string,
): { root: ParsedRoot; key: string } {
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

/** Builds the canonical cache key. `key` must be pre-normalized (from resolveToolPath). */
export function toCacheKey(root: ParsedRoot, key: string): string {
	return `${root.scheme}://${root.bucket}/${key}`;
}
