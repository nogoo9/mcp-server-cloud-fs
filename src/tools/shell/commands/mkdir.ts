// src/tools/shell/commands/mkdir.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * mkdir [-p] <path>
 *
 * Create a directory prefix. -p is accepted but a no-op (cloud storage
 * always creates intermediate prefixes implicitly).
 */
export const mkdir: ShellCommandHandler = async (args, ctx, _stdin) => {
	const paths: string[] = [];

	for (const arg of args) {
		if (arg === "-p") continue; // no-op: cloud storage is always -p
		if (arg.startsWith("-"))
			throw new Error(`mkdir: invalid option — '${arg}'`);
		paths.push(arg);
	}

	if (paths.length === 0) {
		throw new Error("mkdir: missing operand");
	}

	for (const path of paths) {
		const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);
		const prefix = key.endsWith("/") ? key : `${key}/`;
		await ctx.vfs.createPrefix(root, prefix);
	}
	return "";
};
