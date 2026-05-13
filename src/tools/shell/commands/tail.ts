// src/tools/shell/commands/tail.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * tail [-n N] <file>
 *
 * Print the last N lines of a file (default: 10).
 * If no file is given, reads from stdin.
 */
export const tail: ShellCommandHandler = async (args, ctx, stdin) => {
	let n = 10;
	const paths: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "-n") {
			const val = args[++i];
			if (!val) throw new Error("tail: option requires an argument — 'n'");
			n = Number.parseInt(val, 10);
			if (Number.isNaN(n) || n < 1)
				throw new Error(`tail: invalid number of lines — '${val}'`);
		} else if (arg.startsWith("-n")) {
			n = Number.parseInt(arg.slice(2), 10);
			if (Number.isNaN(n) || n < 1)
				throw new Error(`tail: invalid number of lines — '${arg.slice(2)}'`);
		} else if (arg.startsWith("-") && arg !== "-") {
			throw new Error(`tail: invalid option — '${arg}'`);
		} else {
			paths.push(arg);
		}
	}

	let text: string;
	if (paths.length > 0) {
		const { root, key } = resolveShellPath(ctx.roots, paths[0]!, ctx.cwd);
		const buffer = await ctx.vfs.get(root, key);
		text = buffer.toString("utf8");
	} else if (stdin !== null) {
		text = stdin;
	} else {
		throw new Error("tail: missing file operand");
	}

	const lines = text.split("\n");
	return lines.slice(-n).join("\n");
};
