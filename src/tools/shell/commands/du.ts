// src/tools/shell/commands/du.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * du [-s] [-h] [path]
 *
 * Estimate file space usage. Lists sizes of objects under a prefix.
 * -s = summary (total only), -h = human-readable sizes.
 */
export const du: ShellCommandHandler = async (args, ctx, _stdin) => {
	let summary = false;
	let humanReadable = false;
	const paths: string[] = [];

	for (const arg of args) {
		if (arg.startsWith("-") && arg.length > 1) {
			for (const ch of arg.slice(1)) {
				if (ch === "s") summary = true;
				else if (ch === "h") humanReadable = true;
				else throw new Error(`du: invalid option — '${ch}'`);
			}
		} else {
			paths.push(arg);
		}
	}

	if (paths.length === 0) {
		throw new Error("du: missing path operand");
	}

	const output: string[] = [];

	for (const path of paths) {
		const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);
		const prefix = key ? `${key}/` : "";
		const { objects } = await ctx.vfs.list(root, prefix);

		if (summary) {
			let total = 0;
			for (const obj of objects) {
				total += obj.size;
			}
			output.push(`${formatSize(total, humanReadable)}\t${path}`);
		} else {
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const uri = `${root.scheme}://${root.bucket}/${obj.key}`;
				output.push(`${formatSize(obj.size, humanReadable)}\t${uri}`);
			}
			// Total
			const total = objects.reduce((sum, o) => sum + o.size, 0);
			output.push(`${formatSize(total, humanReadable)}\ttotal`);
		}
	}

	return output.join("\n");
};

function formatSize(bytes: number, human: boolean): string {
	if (!human) return String(bytes);

	const units = ["B", "K", "M", "G", "T"];
	let size = bytes;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit++;
	}
	return unit === 0
		? `${size}${units[unit]}`
		: `${size.toFixed(1)}${units[unit]}`;
}
