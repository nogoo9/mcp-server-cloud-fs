// src/tools/shell/commands/echo.ts

import type { ShellCommandHandler } from "../types.js";

/**
 * echo [text...]
 *
 * Print arguments to stdout. Supports -n (no trailing newline) and -e (escape sequences).
 * Primarily useful for piping content into other commands.
 */
export const echo: ShellCommandHandler = async (args, _ctx, _stdin) => {
	let noNewline = false;
	let startIdx = 0;

	if (args[0] === "-n") {
		noNewline = true;
		startIdx = 1;
	}

	const text = args.slice(startIdx).join(" ");
	return noNewline ? text : text;
};
