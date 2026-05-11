// src/tools/shell/commands/rm.ts

import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * rm <file>
 *
 * Remove a file. Requires enableDelete.
 */
export const rm: ShellCommandHandler = async (args, ctx, _stdin) => {
	if (!ctx.enableDelete) {
		throw new Error(
			"rm: operation not permitted — server was not started with --enable-delete",
		);
	}

	if (args.length === 0) {
		throw new Error("rm: missing operand");
	}

	for (const path of args) {
		if (path.startsWith("-")) continue; // ignore flags like -f, -r for now
		const { root, key } = resolveToolPath(ctx.roots, path);
		await ctx.vfs.remove(root, key);
	}
	return "";
};
