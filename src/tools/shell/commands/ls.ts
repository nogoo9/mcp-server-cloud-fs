// src/tools/shell/commands/ls.ts

import { resolveToolPath } from "../../../path-utils.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * ls [-l] [-a] [-R] [path]
 *
 * Lists directory contents. `-l` shows long format (size, date, permissions placeholder).
 * `-a` is accepted but has no effect (cloud storage has no hidden files).
 * `-R` lists recursively.
 */
export const ls: ShellCommandHandler = async (args, ctx, _stdin) => {
	let longFormat = false;
	let recursive = false;
	const paths: string[] = [];

	for (const arg of args) {
		if (arg.startsWith("-") && !arg.startsWith("-n")) {
			for (const ch of arg.slice(1)) {
				if (ch === "l") longFormat = true;
				else if (ch === "a") {
					/* no-op for cloud */
				} else if (ch === "R") recursive = true;
				else throw new Error(`ls: invalid option — '${ch}'`);
			}
		} else {
			paths.push(arg);
		}
	}

	// Default to listing roots if no path given
	if (paths.length === 0) {
		const lines = ctx.roots.map(
			(r) => `${r.scheme}://${r.bucket}${r.prefix ? `/${r.prefix}` : ""}`,
		);
		return lines.join("\n");
	}

	const output: string[] = [];

	for (const path of paths) {
		const { root, key } = resolveToolPath(ctx.roots, path);
		const prefix = key ? `${key}/` : "";
		const delimiter = recursive ? undefined : "/";
		const { objects, prefixes } = await ctx.vfs.list(root, prefix, delimiter);

		if (paths.length > 1) {
			output.push(`${path}:`);
		}

		if (longFormat) {
			// Long format with POSIX-like columns.
			// Permissions show "----------" to make it obvious cloud has no permissions.
			for (const p of prefixes) {
				const name = p.endsWith("/") ? p.slice(0, -1) : p;
				const displayName = name.includes("/")
					? name.slice(name.lastIndexOf("/") + 1)
					: name;
				output.push(
					`d---------  -  -  -            0  -                 ${displayName}/`,
				);
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const name = obj.key.includes("/")
					? obj.key.slice(obj.key.lastIndexOf("/") + 1)
					: obj.key;
				const modified = obj.lastModified
					.toISOString()
					.slice(0, 16)
					.replace("T", " ");
				const size = String(obj.size).padStart(13);
				output.push(`----------  -  -  - ${size}  ${modified}  ${name}`);
			}
		} else {
			for (const p of prefixes) {
				const name = p.endsWith("/") ? p.slice(0, -1) : p;
				const displayName = name.includes("/")
					? name.slice(name.lastIndexOf("/") + 1)
					: name;
				output.push(`${displayName}/`);
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const name = obj.key.includes("/")
					? obj.key.slice(obj.key.lastIndexOf("/") + 1)
					: obj.key;
				output.push(name);
			}
		}
	}

	return output.join("\n");
};
