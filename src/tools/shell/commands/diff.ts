// src/tools/shell/commands/diff.ts

import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * diff <file1> <file2>
 *
 * Compare two files line by line. Outputs a unified-style diff.
 */
export const diff: ShellCommandHandler = async (args, ctx, _stdin) => {
	if (args.length < 2) {
		throw new Error("diff: missing file operand");
	}

	const { root: root1, key: key1 } = resolveToolPath(ctx.roots, args[0]!);
	const { root: root2, key: key2 } = resolveToolPath(ctx.roots, args[1]!);

	const [buf1, buf2] = await Promise.all([
		ctx.vfs.get(root1, key1),
		ctx.vfs.get(root2, key2),
	]);

	const lines1 = buf1.toString("utf8").split("\n");
	const lines2 = buf2.toString("utf8").split("\n");

	if (buf1.toString("utf8") === buf2.toString("utf8")) {
		return "";
	}

	// Simple line-by-line diff (not a full LCS algorithm, but useful for basic comparison)
	const output: string[] = [];
	output.push(`--- ${args[0]}`);
	output.push(`+++ ${args[1]}`);

	const maxLen = Math.max(lines1.length, lines2.length);
	let chunkStart = -1;
	let chunkLines: string[] = [];

	for (let i = 0; i < maxLen; i++) {
		const l1 = i < lines1.length ? lines1[i]! : undefined;
		const l2 = i < lines2.length ? lines2[i]! : undefined;

		if (l1 === l2) {
			if (chunkLines.length > 0) {
				output.push(`@@ -${chunkStart + 1} +${chunkStart + 1} @@`);
				output.push(...chunkLines);
				chunkLines = [];
				chunkStart = -1;
			}
		} else {
			if (chunkStart === -1) chunkStart = i;
			if (l1 !== undefined) chunkLines.push(`-${l1}`);
			if (l2 !== undefined) chunkLines.push(`+${l2}`);
		}
	}

	if (chunkLines.length > 0) {
		output.push(`@@ -${chunkStart + 1} +${chunkStart + 1} @@`);
		output.push(...chunkLines);
	}

	return output.join("\n");
};
