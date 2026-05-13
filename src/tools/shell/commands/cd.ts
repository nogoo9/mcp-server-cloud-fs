// src/tools/shell/commands/cd.ts

import type { ShellCommandHandler } from "../types.js";

/**
 * cd [path]
 *
 * Change the current working directory. Only meaningful in TUI mode.
 * `cd` with no args returns to root. `cd ..` goes up one level.
 * The target must be a valid directory (prefix) in the VFS.
 */
export const cd: ShellCommandHandler = async (args, ctx, _stdin) => {
	const target = args[0] ?? "";

	// cd with no args or "/"" → reset to root
	if (!target || target === "/") {
		ctx.cwd = "";
		return "";
	}

	// Handle ".."
	let newCwd = ctx.cwd ?? "";
	if (target === "..") {
		// Go up one level
		const trimmed = newCwd.replace(/\/+$/, ""); // strip trailing /
		const lastSlash = trimmed.lastIndexOf("/");
		newCwd = lastSlash === -1 ? "" : trimmed.slice(0, lastSlash);
		ctx.cwd = newCwd;
		return "";
	}

	// Resolve relative or absolute target
	if (target.startsWith("/")) {
		// Absolute from root prefix
		newCwd = target.slice(1); // strip leading /
	} else {
		// Relative to current cwd
		newCwd = newCwd ? `${newCwd}/${target}` : target;
	}

	// Normalize: strip trailing slash, collapse double slashes
	newCwd = newCwd.replace(/\/+/g, "/").replace(/\/+$/, "");

	// Verify the directory exists by listing it
	const root = ctx.roots[0]!;
	const prefix = newCwd.endsWith("/") ? newCwd : `${newCwd}/`;
	const result = await ctx.vfs.list(root, prefix, "/");
	if (result.objects.length === 0 && result.prefixes.length === 0) {
		throw new Error(`cd: ${target}: No such directory`);
	}

	ctx.cwd = newCwd;
	return "";
};
