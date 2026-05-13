// src/tools/shell/commands/wc.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * wc [-l] [-w] [-c] [file]
 *
 * Count lines, words, and/or bytes. Reads from stdin if no file given.
 * With no flags, shows all three counts.
 */
export const wc: ShellCommandHandler = async (args, ctx, stdin) => {
	let countLines = false;
	let countWords = false;
	let countBytes = false;
	const paths: string[] = [];

	for (const arg of args) {
		if (arg.startsWith("-") && arg.length > 1) {
			for (const ch of arg.slice(1)) {
				if (ch === "l") countLines = true;
				else if (ch === "w") countWords = true;
				else if (ch === "c") countBytes = true;
				else throw new Error(`wc: invalid option — '${ch}'`);
			}
		} else {
			paths.push(arg);
		}
	}

	// If no specific flag, show all
	if (!countLines && !countWords && !countBytes) {
		countLines = true;
		countWords = true;
		countBytes = true;
	}

	let text: string;
	let label = "";
	if (paths.length > 0) {
		const { root, key } = resolveShellPath(ctx.roots, paths[0]!, ctx.cwd);
		const buffer = await ctx.vfs.get(root, key);
		text = buffer.toString("utf8");
		label = ` ${paths[0]}`;
	} else if (stdin !== null) {
		text = stdin;
	} else {
		throw new Error("wc: missing file operand");
	}

	const parts: string[] = [];
	if (countLines) {
		const lines = text === "" ? 0 : text.split("\n").length;
		parts.push(String(lines).padStart(8));
	}
	if (countWords) {
		const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
		parts.push(String(words).padStart(8));
	}
	if (countBytes) {
		parts.push(String(Buffer.byteLength(text, "utf8")).padStart(8));
	}

	return parts.join("") + label;
};
