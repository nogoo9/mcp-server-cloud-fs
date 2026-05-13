// src/tools/shell/commands/ls.ts

import { resolveShellPath } from "../resolve.js";
import type { ShellCommandHandler } from "../types.js";

/**
 * Strip a listing prefix from a full key, leaving the relative portion.
 * e.g. stripPrefix("data/logs/app.log", "data/") → "logs/app.log"
 */
function stripPrefix(key: string, prefix: string): string {
	if (prefix && key.startsWith(prefix)) return key.slice(prefix.length);
	return key;
}

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

	// Default to listing the current working directory
	if (paths.length === 0) {
		const root = ctx.roots[0]!;
		const cwd = ctx.cwd ?? "";
		const baseParts = [root.prefix, cwd].filter(Boolean).join("/");
		const prefix = baseParts ? `${baseParts}/` : "";
		const { objects, prefixes } = await ctx.vfs.list(
			root,
			prefix,
			recursive ? undefined : "/",
		);
		const lines: string[] = [];
		if (longFormat) {
			for (const p of prefixes) {
				const name = stripPrefix(p.replace(/\/$/, ""), prefix);
				lines.push(
					`d---------  -  -  -            0  -                 ${name}/`,
				);
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const name = stripPrefix(obj.key, prefix);
				const modified = obj.lastModified
					.toISOString()
					.slice(0, 16)
					.replace("T", " ");
				const size = String(obj.size).padStart(13);
				lines.push(`----------  -  -  - ${size}  ${modified}  ${name}`);
			}
		} else {
			for (const p of prefixes) {
				lines.push(`${stripPrefix(p.replace(/\/$/, ""), prefix)}/`);
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				lines.push(stripPrefix(obj.key, prefix));
			}
		}
		return lines.join("\n");
	}

	const output: string[] = [];

	for (const path of paths) {
		const { root, key } = resolveShellPath(ctx.roots, path, ctx.cwd);
		const listPrefix = key ? `${key}/` : "";
		const delimiter = recursive ? undefined : "/";
		const { objects, prefixes } = await ctx.vfs.list(
			root,
			listPrefix,
			delimiter,
		);

		if (paths.length > 1) {
			output.push(`${path}:`);
		}

		if (longFormat) {
			for (const p of prefixes) {
				const name = stripPrefix(p.replace(/\/$/, ""), listPrefix);
				output.push(
					`d---------  -  -  -            0  -                 ${name}/`,
				);
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				const name = stripPrefix(obj.key, listPrefix);
				const modified = obj.lastModified
					.toISOString()
					.slice(0, 16)
					.replace("T", " ");
				const size = String(obj.size).padStart(13);
				output.push(`----------  -  -  - ${size}  ${modified}  ${name}`);
			}
		} else {
			for (const p of prefixes) {
				output.push(`${stripPrefix(p.replace(/\/$/, ""), listPrefix)}/`);
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				output.push(stripPrefix(obj.key, listPrefix));
			}
		}
	}

	return output.join("\n");
};
