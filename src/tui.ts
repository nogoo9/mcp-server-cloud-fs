// src/tui.ts
// Interactive terminal REPL for the cloud-fs shell.
// Uses node:readline — works on both Bun and Node.js.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import type { ParsedRoot } from "./providers/interface.js";
import { executeShell } from "./tools/shell/index.js";
import { COMMANDS } from "./tools/shell/registry.js";
import type { ShellContext } from "./tools/shell/types.js";
import type { VirtualFS } from "./vfs.js";

// ── ANSI helpers ───────────────────────────────────────────────────────────
const BLUE = "\x1b[38;2;137;180;250m";
const GREEN = "\x1b[38;2;166;227;161m";
const YELLOW = "\x1b[38;2;249;226;175m";
const RED = "\x1b[38;2;243;139;168m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── History file ───────────────────────────────────────────────────────────
const HISTORY_FILE = join(homedir(), ".cloud-fs_history");
const MAX_HISTORY = 500;

function loadHistory(): string[] {
	try {
		if (existsSync(HISTORY_FILE)) {
			return readFileSync(HISTORY_FILE, "utf8")
				.split("\n")
				.filter((l) => l.trim());
		}
	} catch {
		// Ignore — history is optional
	}
	return [];
}

function saveHistory(history: string[]): void {
	try {
		const dir = dirname(HISTORY_FILE);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			HISTORY_FILE,
			`${history.slice(-MAX_HISTORY).join("\n")}\n`,
			"utf8",
		);
	} catch {
		// Ignore — best effort
	}
}

// ── Prompt builder ─────────────────────────────────────────────────────────
function rootLabel(roots: ParsedRoot[]): string {
	if (roots.length === 1) {
		const r = roots[0]!;
		return `${r.scheme}://${r.bucket}${r.prefix ? `/${r.prefix}` : ""}`;
	}
	return `${roots.length} roots`;
}

function buildPrompt(roots: ParsedRoot[], cwd: string): string {
	const base = rootLabel(roots);
	const cwdPart = cwd ? `/${cwd}` : "";
	return `${BLUE}cloud-fs ${DIM}[${base}${YELLOW}${cwdPart}${DIM}]${RESET}${BLUE}>${RESET} `;
}

// ── Built-in commands ──────────────────────────────────────────────────────
function handleBuiltin(
	cmd: string,
	roots: ParsedRoot[],
	cwd: string,
	rl: Interface,
): string | null | undefined {
	const trimmed = cmd.trim();

	if (trimmed === "help") {
		const cmds = [...COMMANDS.keys()].join(", ");
		return [
			`${BOLD}${BLUE}Available commands:${RESET}`,
			`  ${cmds}`,
			"",
			`${BOLD}${BLUE}Built-in:${RESET}`,
			"  help, clear, pwd, env, exit/quit",
			"",
			`${BOLD}${BLUE}Piping & redirection:${RESET}`,
			"  cat file.txt | grep pattern | wc -l",
			"  echo hello > file.txt",
			"  echo world >> file.txt",
		].join("\n");
	}

	if (trimmed === "pwd") {
		return roots
			.map((r) => {
				const base = `${r.scheme}://${r.bucket}${r.prefix ? `/${r.prefix}` : ""}`;
				return cwd ? `${base}/${cwd}` : base;
			})
			.join("\n");
	}

	if (trimmed === "env") {
		return roots
			.map(
				(r, i) =>
					`root[${i}]: ${r.scheme}://${r.bucket}${r.prefix ? `/${r.prefix}` : ""}`,
			)
			.join("\n");
	}

	if (trimmed === "clear") {
		process.stdout.write("\x1bc");
		return "";
	}

	if (trimmed === "exit" || trimmed === "quit") {
		rl.close();
		return null;
	}

	return undefined;
}

// ── Tab completer ──────────────────────────────────────────────────────────
function makeCompleter(
	vfs: VirtualFS,
	roots: ParsedRoot[],
	shellCtx: ShellContext,
): (line: string) => Promise<[string[], string]> {
	const commandNames = [
		...COMMANDS.keys(),
		"help",
		"clear",
		"pwd",
		"env",
		"exit",
		"quit",
	];

	return async (line: string): Promise<[string[], string]> => {
		const parts = line.trimStart().split(/\s+/);

		// Complete command name (first token)
		if (parts.length <= 1) {
			const partial = parts[0] ?? "";
			const hits = commandNames.filter((c) => c.startsWith(partial));
			return [hits.length ? hits : commandNames, partial];
		}

		// Complete cloud path (subsequent tokens)
		const partial = parts[parts.length - 1] ?? "";

		// Skip completion for flags
		if (partial.startsWith("-")) return [[], partial];

		try {
			const root = roots[0]!;
			const cwd = shellCtx.cwd ?? "";

			// Determine prefix to list: everything up to the last "/"
			const lastSlash = partial.lastIndexOf("/");
			const dirPart = lastSlash >= 0 ? partial.slice(0, lastSlash + 1) : "";

			// Build the VFS prefix: root.prefix + cwd + dirPart
			const cwdPrefix = cwd ? `${cwd}/` : "";
			const listPrefix = root.prefix
				? `${root.prefix}/${cwdPrefix}${dirPart}`
				: `${cwdPrefix}${dirPart}`;

			const { objects, prefixes } = await vfs.list(root, listPrefix, "/");

			// Strip root.prefix + cwd so completions are relative to cwd
			const stripLen = root.prefix
				? root.prefix.length + 1 + cwdPrefix.length
				: cwdPrefix.length;

			const completions: string[] = [];
			for (const p of prefixes) {
				completions.push(p.slice(stripLen));
			}
			for (const obj of objects) {
				if (obj.key.endsWith("/")) continue;
				completions.push(obj.key.slice(stripLen));
			}

			const hits = completions.filter((c) => c.startsWith(partial));
			return [hits, partial];
		} catch {
			return [[], partial];
		}
	};
}

// ── Main REPL ──────────────────────────────────────────────────────────────
export interface TuiOptions {
	enableDelete?: boolean;
}

export async function startTui(
	vfs: VirtualFS,
	roots: ParsedRoot[],
	cleanup: () => Promise<void>,
	opts: TuiOptions = {},
): Promise<void> {
	// Load history
	const history = loadHistory();

	const shellCtx: ShellContext = {
		vfs,
		roots,
		enableDelete: opts.enableDelete,
		cwd: "",
	};

	const completer = makeCompleter(vfs, roots, shellCtx);
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
		prompt: buildPrompt(roots, ""),
		completer: (
			line: string,
			cb: (err: Error | null, result: [string[], string]) => void,
		) => {
			completer(line).then(
				(result) => cb(null, result),
				(err) => cb(err as Error, [[], line]),
			);
		},
		history,
		historySize: MAX_HISTORY,
	});

	// Banner
	console.log(`${GREEN}┌───────────────────────────────────────────┐${RESET}`);
	console.log(
		`${GREEN}│${RESET}   ${BOLD}${BLUE}cloud-fs${RESET} interactive shell              ${GREEN}│${RESET}`,
	);
	console.log(
		`${GREEN}│${RESET}   Type ${DIM}help${RESET} for commands, ${DIM}exit${RESET} to quit      ${GREEN}│${RESET}`,
	);
	console.log(`${GREEN}└───────────────────────────────────────────┘${RESET}`);
	console.log();

	rl.prompt();

	// Command queue — ensures sequential execution of async commands.
	// Without this, piped stdin fires all line events before any handler
	// resolves, causing cd + ls to race.
	const commandQueue: string[] = [];
	let processing = false;

	async function processQueue(): Promise<void> {
		if (processing) return;
		processing = true;
		while (commandQueue.length > 0) {
			const trimmed = commandQueue.shift()!;
			await processCommand(trimmed);
		}
		processing = false;
		rl.setPrompt(buildPrompt(roots, shellCtx.cwd ?? ""));
		rl.prompt();
	}

	async function processCommand(trimmed: string): Promise<void> {
		// Check built-ins first
		const builtinResult = handleBuiltin(trimmed, roots, shellCtx.cwd ?? "", rl);
		if (builtinResult === null) return; // exit was called
		if (builtinResult !== undefined) {
			if (builtinResult) console.log(builtinResult);
			return;
		}

		// Execute shell command
		try {
			const result = await executeShell(trimmed, shellCtx);
			if (result) console.log(result);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`${RED}${msg}${RESET}`);
		}
	}

	rl.on("line", (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) {
			rl.prompt();
			return;
		}
		commandQueue.push(trimmed);
		processQueue();
	});

	rl.on("close", async () => {
		// Save history
		// biome-ignore lint/suspicious/noExplicitAny: readline exposes history as any[]
		const rlHistory = (rl as any).history as string[] | undefined;
		if (rlHistory) saveHistory([...rlHistory].reverse());
		console.log(`\n${DIM}Flushing…${RESET}`);
		await cleanup();
		console.log(`${GREEN}Goodbye!${RESET}`);
		process.exit(0);
	});
}
