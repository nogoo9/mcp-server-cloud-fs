// src/tools/shell/commands/cp.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * cp <source> <destination>
 *
 * Copy a file from source to destination using VFS.copy().
 */
export const cp: ShellCommandHandler = async (args, ctx, _stdin) => {
	if (args.length < 2) {
		throw new Error("cp: missing file operand");
	}
	if (args.length > 2) {
		throw new Error("cp: too many arguments");
	}

	const { root: srcRoot, key: srcKey } = resolveShellPath(
		ctx.roots,
		args[0]!,
		ctx.cwd,
	);
	const { root: dstRoot, key: dstKey } = resolveShellPath(
		ctx.roots,
		args[1]!,
		ctx.cwd,
	);

	await ctx.vfs.copy(srcRoot, srcKey, dstRoot, dstKey);
	return "";
};
