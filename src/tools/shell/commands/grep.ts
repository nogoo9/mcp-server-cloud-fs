// src/tools/shell/commands/grep.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * grep [-i] [-n] [-r] [-c] <pattern> [path]
 *
 * Search for lines matching a regex pattern.
 * Reads from stdin if no path is given.
 * -i = case-insensitive, -n = show line numbers, -r = recursive, -c = count only.
 */
export const grep: ShellCommandHandler = async (args, ctx, stdin) => {
	let caseInsensitive = false;
	let showLineNumbers = false;
	let recursive = false;
	let countOnly = false;
	const positional: string[] = [];

	for (const arg of args) {
		if (arg.startsWith("-") && arg.length > 1 && !arg.startsWith("--")) {
			for (const ch of arg.slice(1)) {
				if (ch === "i") caseInsensitive = true;
				else if (ch === "n") showLineNumbers = true;
				else if (ch === "r" || ch === "R") recursive = true;
				else if (ch === "c") countOnly = true;
				else throw new Error(`grep: invalid option — '${ch}'`);
			}
		} else {
			positional.push(arg);
		}
	}

	if (positional.length === 0) {
		throw new Error("grep: missing pattern");
	}

	const pattern = positional[0]!;
	const flags = caseInsensitive ? "i" : "";
	const re = new RegExp(pattern, flags);

	// No file path — read from stdin
	if (positional.length === 1) {
		if (stdin === null) {
			throw new Error("grep: missing file operand");
		}
		return grepText(stdin, re, showLineNumbers, countOnly, null);
	}

	const path = positional[1]!;
	const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);

	if (recursive) {
		// Recursive: list all objects under prefix and grep each
		const prefix = key ? `${key}/` : "";
		const { objects } = await ctx.vfs.list(root, prefix);
		const results: string[] = [];

		for (const obj of objects) {
			if (obj.key.endsWith("/")) continue;
			try {
				const buf = await ctx.vfs.get(root, obj.key);
				const uri = `${root.scheme}://${root.bucket}/${obj.key}`;
				const text = buf.toString("utf8");
				const matches = grepText(text, re, showLineNumbers, countOnly, uri);
				if (matches) results.push(matches);
			} catch {
				// skip unreadable files
			}
		}
		return results.join("\n");
	}

	// Single file
	const buf = await ctx.vfs.get(root, key);
	return grepText(buf.toString("utf8"), re, showLineNumbers, countOnly, null);
};

function grepText(
	text: string,
	re: RegExp,
	showLineNumbers: boolean,
	countOnly: boolean,
	filePrefix: string | null,
): string {
	const lines = text.split("\n");
	const matches: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (re.test(lines[i]!)) {
			if (countOnly) {
				matches.push("");
			} else {
				let line = lines[i]!;
				if (showLineNumbers) line = `${i + 1}:${line}`;
				if (filePrefix) line = `${filePrefix}:${line}`;
				matches.push(line);
			}
		}
	}

	if (countOnly) {
		const count = String(matches.length);
		return filePrefix ? `${filePrefix}:${count}` : count;
	}

	return matches.join("\n");
}
