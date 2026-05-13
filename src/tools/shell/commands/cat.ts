// src/tools/shell/commands/cat.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * cat <file> [file...]
 *
 * Concatenate and print file contents. If stdin is piped and no files given,
 * passes stdin through (passthrough mode).
 */
export const cat: ShellCommandHandler = async (args, ctx, stdin) => {
	if (args.length === 0) {
		// Passthrough mode — echo stdin
		return stdin ?? "";
	}

	const parts: string[] = [];
	for (const path of args) {
		const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);
		const buffer = await ctx.vfs.get(root, key);
		parts.push(buffer.toString("utf8"));
	}
	return parts.join("");
};
