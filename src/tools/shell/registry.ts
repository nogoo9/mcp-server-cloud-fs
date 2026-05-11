// src/tools/shell/registry.ts
// Maps command names to their handler functions.

import { cat } from "./commands/cat.js";
import { cp } from "./commands/cp.js";
import { diff } from "./commands/diff.js";
import { du } from "./commands/du.js";
import { echo } from "./commands/echo.js";
import { find } from "./commands/find.js";
import { grep } from "./commands/grep.js";
import { head } from "./commands/head.js";
import { ls } from "./commands/ls.js";
import { mkdir } from "./commands/mkdir.js";
import { mv } from "./commands/mv.js";
import { rm } from "./commands/rm.js";
import { stat } from "./commands/stat.js";
import { tail } from "./commands/tail.js";
import { tee } from "./commands/tee.js";
import { touch } from "./commands/touch.js";
import { wc } from "./commands/wc.js";
import type { ShellCommandHandler } from "./types.js";

/** All registered shell commands. */
export const COMMANDS: ReadonlyMap<string, ShellCommandHandler> = new Map<
	string,
	ShellCommandHandler
>([
	["ls", ls],
	["cat", cat],
	["head", head],
	["tail", tail],
	["cp", cp],
	["mv", mv],
	["rm", rm],
	["mkdir", mkdir],
	["touch", touch],
	["stat", stat],
	["find", find],
	["grep", grep],
	["wc", wc],
	["du", du],
	["echo", echo],
	["tee", tee],
	["diff", diff],
]);
