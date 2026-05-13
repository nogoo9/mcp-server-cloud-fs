// src/tools/shell/commands/jq.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * jq <filter> [path]
 *
 * Query JSON data using a filter. Reads from stdin if no path is given.
 * Supports basic dot-notation filters like '.foo.bar' and '.items[0]'.
 */
export const jq: ShellCommandHandler = async (args, ctx, stdin) => {
	if (args.length === 0) {
		throw new Error("jq: missing filter");
	}

	const filter = args[0]!;
	let jsonContent: string;

	if (args.length === 1) {
		if (stdin === null) {
			throw new Error("jq: missing input data (stdin or file)");
		}
		jsonContent = stdin;
	} else {
		const path = args[1]!;
		const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);
		const buffer = await ctx.vfs.get(root, key);
		jsonContent = buffer.toString("utf8");
	}

	// biome-ignore lint/suspicious/noExplicitAny: JSON values are inherently untyped
	let data: any;
	try {
		data = JSON.parse(jsonContent);
	} catch (err) {
		throw new Error(
			`jq: invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	const result = evaluateFilter(data, filter);

	if (result === undefined) {
		return "";
	}

	if (typeof result === "string") {
		return result;
	}

	return JSON.stringify(result, null, 2);
};

// biome-ignore lint/suspicious/noExplicitAny: JSON values are inherently untyped
function evaluateFilter(data: any, filter: string): any {
	if (filter === "." || filter === "" || filter === "'.'" || filter === '"') {
		return data;
	}

	// Remove surrounding quotes if any (e.g. jq '.' or jq ".foo")
	const cleanFilter = filter.replace(/^['"]|['"]$/g, "");
	if (cleanFilter === "." || cleanFilter === "") return data;

	const parts = cleanFilter.split(".");
	let current = data;

	for (const part of parts) {
		if (part === "" || part === "$") continue;

		// Handle array access like "items[0]" or "[0]"
		const subParts = part.split(/[[\]]/).filter((p) => p !== "");
		for (const sub of subParts) {
			if (current === null || current === undefined) return undefined;

			// Check if sub is a numeric index
			if (/^\d+$/.test(sub)) {
				current = current[Number.parseInt(sub, 10)];
			} else {
				current = current[sub];
			}
		}
	}

	return current;
}
