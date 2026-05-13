// src/tools/shell/commands/mv.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * mv <source> <destination>
 *
 * Move a file (copy + delete source). Requires enableDelete.
 */
export const mv: ShellCommandHandler = async (args, ctx, _stdin) => {
	if (!ctx.enableDelete) {
		throw new Error(
			"mv: operation not permitted — server was not started with --enable-delete",
		);
	}

	if (args.length < 2) {
		throw new Error("mv: missing file operand");
	}
	if (args.length > 2) {
		throw new Error("mv: too many arguments");
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
	await ctx.vfs.remove(srcRoot, srcKey);
	return "";
};
