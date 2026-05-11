// src/tools/shell/commands/find.ts

import { minimatch } from "minimatch";
import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * find <path> [-name pattern] [-type f|d]
 *
 * Recursively list files under path. Optionally filter by glob pattern
 * or type (f=files, d=directories).
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

	if (paths.length === 0) {
		throw new Error("find: missing path operand");
	}

	const output: string[] = [];

	for (const path of paths) {
		const { root, key } = resolveToolPath(ctx.roots, path);
		const prefix = key ? `${key}/` : "";
		const { objects, prefixes } = await ctx.vfs.list(root, prefix);

		// Include directories
		if (typeFilter !== "f") {
			for (const p of prefixes) {
				const name = p.endsWith("/") ? p.slice(0, -1) : p;
				const basename = name.includes("/")
					? name.slice(name.lastIndexOf("/") + 1)
					: name;
				if (namePattern && !minimatch(basename, namePattern, { dot: true }))
					continue;
				output.push(`${root.scheme}://${root.bucket}/${p}`);
			}
		}

		// Include files
		if (typeFilter !== "d") {
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const basename = obj.key.includes("/")
					? obj.key.slice(obj.key.lastIndexOf("/") + 1)
					: obj.key;
				if (namePattern && !minimatch(basename, namePattern, { dot: true }))
					continue;
				output.push(`${root.scheme}://${root.bucket}/${obj.key}`);
			}
		}
	}

	return output.join("\n");
};
