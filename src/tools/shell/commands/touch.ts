// src/tools/shell/commands/touch.ts

import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * touch <file>
 *
 * Create an empty file if it does not exist, or update its metadata.
 * In cloud storage, this writes a zero-byte object.
 */
export const touch: ShellCommandHandler = async (args, ctx, _stdin) => {
	if (args.length === 0) {
		throw new Error("touch: missing file operand");
	}

	for (const path of args) {
		if (path.startsWith("-")) continue;
		const { root, key } = resolveToolPath(ctx.roots, path);

		// Check if file already exists; if so, re-write it to update lastModified
		try {
			const existing = await ctx.vfs.get(root, key);
			await ctx.vfs.put(root, key, existing);
		} catch {
			// File doesn't exist — create empty
			await ctx.vfs.put(root, key, Buffer.alloc(0));
		}
	}
	return "";
};
