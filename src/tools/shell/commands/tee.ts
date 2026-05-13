// src/tools/shell/commands/tee.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * tee [-a] <file>
 *
 * Read from stdin and write to file(s) AND stdout.
 * -a = append mode (reads existing content first, appends stdin).
 */
export const tee: ShellCommandHandler = async (args, ctx, stdin) => {
	if (stdin === null) {
		throw new Error("tee: no input (pipe something into tee)");
	}

	let appendMode = false;
	const paths: string[] = [];

	for (const arg of args) {
		if (arg === "-a") {
			appendMode = true;
		} else if (arg.startsWith("-")) {
			throw new Error(`tee: invalid option — '${arg}'`);
		} else {
			paths.push(arg);
		}
	}

	if (paths.length === 0) {
		throw new Error("tee: missing file operand");
	}

	for (const path of paths) {
		const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);

		if (appendMode) {
			let existing = "";
			try {
				const buf = await ctx.vfs.get(root, key);
				existing = buf.toString("utf8");
			} catch {
				// File doesn't exist — start empty
			}
			await ctx.vfs.put(root, key, Buffer.from(existing + stdin, "utf8"));
		} else {
			await ctx.vfs.put(root, key, Buffer.from(stdin, "utf8"));
		}
	}

	// tee passes stdin through to stdout
	return stdin;
};
