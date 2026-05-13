// src/tools/shell/types.ts
// Types shared by all shell command handlers.

import type { ParsedRoot } from "../../providers/interface.js";
import type { VirtualFS } from "../../vfs.js";

/** Context passed to every shell command handler. @category Shell */
export interface ShellContext {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	/** Whether destructive commands (rm, mv) are allowed. */
	enableDelete?: boolean | undefined;
	/** Current working directory, relative to the root prefix. TUI-only. */
	cwd?: string | undefined;
}

/**
 * A shell command handler.
 *
 * @param args    - Parsed argument tokens (excluding the command name itself).
 * @param ctx     - VFS and root context.
 * @param stdin   - Piped input from the previous command in a pipeline, or null.
 * @returns       - The command's stdout string.
 *
 * @category Shell
 */
export type ShellCommandHandler = (
	args: string[],
	ctx: ShellContext,
	stdin: string | null,
) => Promise<string>;
