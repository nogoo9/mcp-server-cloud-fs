// src/tools/shell/commands/stat.ts

import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * stat <file>
 *
 * Display file metadata. Cloud storage does not have permissions,
 * so those fields show as n/a.
 */
export const stat: ShellCommandHandler = async (args, ctx, _stdin) => {
	if (args.length === 0) {
		throw new Error("stat: missing operand");
	}

	const output: string[] = [];

	for (const path of args) {
		if (path.startsWith("-")) continue;
		const { root, key } = resolveToolPath(ctx.roots, path);
		const info = await ctx.vfs.stat(root, key);
		const uri = `${root.scheme}://${root.bucket}/${key}`;

		output.push(`  File: ${uri}`);
		output.push(`  Size: ${info.size}\tBlocks: n/a\tIO Block: n/a`);
		output.push(`  Type: ${info.contentType ?? "application/octet-stream"}`);
		output.push(`Access: (n/a — cloud object storage has no permissions)`);
		output.push(`Modify: ${info.lastModified.toISOString()}`);
		output.push(`Change: n/a`);
		output.push(` Birth: n/a`);
	}

	return output.join("\n");
};
