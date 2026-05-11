// src/tools/shell/commands/head.ts

import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * head [-n N] <file>
 *
 * Print the first N lines of a file (default: 10).
 * If no file is given, reads from stdin.
 */
export const head: ShellCommandHandler = async (args, ctx, stdin) => {
	let n = 10;
	const paths: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "-n") {
			const val = args[++i];
			if (!val) throw new Error("head: option requires an argument — 'n'");
			n = Number.parseInt(val, 10);
			if (Number.isNaN(n) || n < 1)
				throw new Error(`head: invalid number of lines — '${val}'`);
		} else if (arg.startsWith("-n")) {
			n = Number.parseInt(arg.slice(2), 10);
			if (Number.isNaN(n) || n < 1)
				throw new Error(`head: invalid number of lines — '${arg.slice(2)}'`);
		} else if (arg.startsWith("-") && arg !== "-") {
			throw new Error(`head: invalid option — '${arg}'`);
		} else {
			paths.push(arg);
		}
	}

	let text: string;
	if (paths.length > 0) {
		const { root, key } = resolveToolPath(ctx.roots, paths[0]!);
		const buffer = await ctx.vfs.get(root, key);
		text = buffer.toString("utf8");
	} else if (stdin !== null) {
		text = stdin;
	} else {
		throw new Error("head: missing file operand");
	}

	const lines = text.split("\n");
	return lines.slice(0, n).join("\n");
};
