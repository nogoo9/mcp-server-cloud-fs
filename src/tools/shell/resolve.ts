// src/tools/shell/resolve.ts
// Shell-aware path resolver that respects the current working directory.

import { resolveToolPath } from "../../path-utils.js";
import type { ParsedRoot } from "../../providers/interface.js";

const ABS_URI_RE = /^[a-z][a-z0-9]*:\/\//;

/**
 * Resolve a path within the shell, taking `cwd` into account.
 * Relative paths are prefixed with `cwd/` before being passed to
 * `resolveToolPath`, so `cd` changes where relative paths point.
 */
export function resolveShellPath(
	roots: ParsedRoot[],
	path: string,
	cwd?: string,
): { root: ParsedRoot; key: string } {
	// Absolute URIs bypass cwd entirely
	if (ABS_URI_RE.test(path)) return resolveToolPath(roots, path);

	// Prepend cwd to relative paths
	const effective = cwd ? `${cwd}/${path}` : path;
	return resolveToolPath(roots, effective);
}
