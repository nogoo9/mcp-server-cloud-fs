// src/tools/shell/commands/find.ts

import { minimatch } from "minimatch";
import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * find [path] [-name pattern] [-type f|d]
 *
 * Recursively list files under path. Defaults to the first root.
 * Optionally filter by glob pattern or type (f=files, d=directories).
 * Output is relative to the listing prefix so it can be piped back
 * to other commands (cat, grep, etc.).
 */
export const find: ShellCommandHandler = async (args, ctx, _stdin) => {
	let namePattern: string | null = null;
	let typeFilter: "f" | "d" | null = null;
	const paths: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "-name") {
			namePattern = args[++i] ?? null;
			if (!namePattern) throw new Error("find: missing argument to '-name'");
		} else if (arg === "-type") {
			const val = args[++i];
			if (val !== "f" && val !== "d")
				throw new Error(`find: unknown type — '${val}'`);
			typeFilter = val;
		} else if (arg.startsWith("-")) {
			throw new Error(`find: unknown predicate — '${arg}'`);
		} else {
			paths.push(arg);
		}
	}

	// Default to listing the first root if no path given
	const searchPaths = paths.length > 0 ? paths : [null];
	const output: string[] = [];

	for (const path of searchPaths) {
		let root = ctx.roots[0]!;
		let listPrefix: string;

		if (path !== null) {
			const resolved = resolveShellPath(ctx.roots, path, ctx.cwd);
			root = resolved.root;
			listPrefix = resolved.key ? `${resolved.key}/` : "";
		} else {
			// No explicit path — search from cwd
			const cwd = ctx.cwd ?? "";
			const baseParts = [root.prefix, cwd].filter(Boolean).join("/");
			listPrefix = baseParts ? `${baseParts}/` : "";
		}

		const { objects, prefixes } = await ctx.vfs.list(root, listPrefix);

		// Directories
		if (typeFilter !== "f") {
			for (const p of prefixes) {
				const rel = p.startsWith(listPrefix) ? p.slice(listPrefix.length) : p;
				const basename = rel.replace(/\/$/, "").split("/").pop()!;
				if (namePattern && !minimatch(basename, namePattern, { dot: true }))
					continue;
				output.push(`${rel.replace(/\/$/, "")}/`);
			}
		}

		// Files
		if (typeFilter !== "d") {
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const rel = obj.key.startsWith(listPrefix)
					? obj.key.slice(listPrefix.length)
					: obj.key;
				const basename = rel.split("/").pop()!;
				if (namePattern && !minimatch(basename, namePattern, { dot: true }))
					continue;
				output.push(rel);
			}
		}
	}

	return output.join("\n");
};
