// src/app/shell-app.ts
// xterm.js MCP App — interactive cloud-fs shell rendered in a host iframe.

import { App } from "@modelcontextprotocol/ext-apps";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

// ── Theme ──────────────────────────────────────────────────────────────────
const THEME = {
	background: "#1e1e2e",
	foreground: "#cdd6f4",
	cursor: "#f5e0dc",
	cursorAccent: "#1e1e2e",
	selectionBackground: "#585b7066",
	black: "#45475a",
	red: "#f38ba8",
	green: "#a6e3a1",
	yellow: "#f9e2af",
	blue: "#89b4fa",
	magenta: "#f5c2e7",
	cyan: "#94e2d5",
	white: "#bac2de",
	brightBlack: "#585b70",
	brightRed: "#f38ba8",
	brightGreen: "#a6e3a1",
	brightYellow: "#f9e2af",
	brightBlue: "#89b4fa",
	brightMagenta: "#f5c2e7",
	brightCyan: "#94e2d5",
	brightWhite: "#a6adc8",
};

const PROMPT = "\x1b[38;2;137;180;250m❯\x1b[0m ";

// ── Terminal setup ─────────────────────────────────────────────────────────
const term = new Terminal({
	theme: THEME,
	fontFamily:
		'"Fira Code", "Cascadia Code", "JetBrains Mono", Menlo, monospace',
	fontSize: 14,
	cursorBlink: true,
	cursorStyle: "bar",
	allowProposedApi: true,
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal")!);
fitAddon.fit();

// ── MCP App bridge ─────────────────────────────────────────────────────────
const app = new App({ name: "cloud-fs-shell", version: "0.3.0" });
app.connect();

// ── State ──────────────────────────────────────────────────────────────────
let currentLine = "";
const history: string[] = [];
let historyIdx = -1;

// ── Write helpers ──────────────────────────────────────────────────────────
function writeLn(text: string): void {
	for (const line of text.split("\n")) {
		term.writeln(line);
	}
}

function writePrompt(): void {
	term.write(PROMPT);
}

// ── Welcome banner ─────────────────────────────────────────────────────────
term.writeln(
	"\x1b[1;38;2;166;227;161m┌──────────────────────────────────────┐\x1b[0m",
);
term.writeln(
	"\x1b[1;38;2;166;227;161m│\x1b[0m   \x1b[1;38;2;137;180;250mcloud-fs\x1b[0m interactive shell          \x1b[1;38;2;166;227;161m│\x1b[0m",
);
term.writeln(
	"\x1b[1;38;2;166;227;161m│\x1b[0m   Type commands like ls, cat, grep    \x1b[1;38;2;166;227;161m│\x1b[0m",
);
term.writeln(
	"\x1b[1;38;2;166;227;161m│\x1b[0m   Piping supported: cmd1 | cmd2       \x1b[1;38;2;166;227;161m│\x1b[0m",
);
term.writeln(
	"\x1b[1;38;2;166;227;161m└──────────────────────────────────────┘\x1b[0m",
);
term.writeln("");
writePrompt();

// ── Command execution ──────────────────────────────────────────────────────
async function executeCommand(command: string): Promise<void> {
	if (!command.trim()) {
		writePrompt();
		return;
	}

	// Built-in: clear
	if (command.trim() === "clear") {
		term.clear();
		writePrompt();
		return;
	}

	// Built-in: help
	if (command.trim() === "help") {
		writeLn("\x1b[1;38;2;137;180;250mAvailable commands:\x1b[0m");
		writeLn("  ls, cat, head, tail, cp, mv, rm, mkdir, touch");
		writeLn("  stat, find, grep, wc, du, echo, tee, diff");
		writeLn("  clear, help");
		writeLn("");
		writeLn("\x1b[1;38;2;249;226;175mPiping & redirection:\x1b[0m");
		writeLn("  cat file.txt | grep pattern | wc -l");
		writeLn("  echo hello > file.txt");
		writeLn("  echo world >> file.txt");
		writeLn("");
		writePrompt();
		return;
	}

	try {
		const result = await app.callServerTool({
			name: "shell",
			arguments: { command },
		});
		const text = result.content?.find(
			(c: { type: string }) => c.type === "text",
		) as { text?: string } | undefined;
		if (text?.text) {
			// Color error output in red
			if (result.isError) {
				writeLn(`\x1b[38;2;243;139;168m${text.text}\x1b[0m`);
			} else {
				writeLn(text.text);
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		writeLn(`\x1b[38;2;243;139;168mError: ${msg}\x1b[0m`);
	}
	writePrompt();
}

// ── Input handling ─────────────────────────────────────────────────────────
term.onData((data: string) => {
	const code = data.charCodeAt(0);

	if (data === "\r") {
		// Enter
		term.writeln("");
		if (currentLine.trim()) {
			history.push(currentLine);
		}
		const cmd = currentLine;
		currentLine = "";
		historyIdx = -1;
		void executeCommand(cmd);
	} else if (code === 127 || data === "\b") {
		// Backspace
		if (currentLine.length > 0) {
			currentLine = currentLine.slice(0, -1);
			term.write("\b \b");
		}
	} else if (data === "\x1b[A") {
		// Up arrow — history
		if (history.length > 0) {
			if (historyIdx === -1) historyIdx = history.length;
			if (historyIdx > 0) {
				historyIdx--;
				// Clear current line
				term.write(`\r${PROMPT}${" ".repeat(currentLine.length)}\r${PROMPT}`);
				currentLine = history[historyIdx]!;
				term.write(currentLine);
			}
		}
	} else if (data === "\x1b[B") {
		// Down arrow — history
		if (historyIdx !== -1) {
			historyIdx++;
			term.write(`\r${PROMPT}${" ".repeat(currentLine.length)}\r${PROMPT}`);
			if (historyIdx >= history.length) {
				historyIdx = -1;
				currentLine = "";
			} else {
				currentLine = history[historyIdx]!;
				term.write(currentLine);
			}
		}
	} else if (data === "\x03") {
		// Ctrl+C
		term.writeln("^C");
		currentLine = "";
		historyIdx = -1;
		writePrompt();
	} else if (code >= 32) {
		// Printable characters
		currentLine += data;
		term.write(data);
	}
});

// ── Handle initial tool result from host ───────────────────────────────────
app.ontoolresult = (result: {
	content?: Array<{ type: string; text?: string }>;
}) => {
	const text = result.content?.find((c) => c.type === "text") as
		| { text?: string }
		| undefined;
	if (text?.text) {
		writeLn(text.text);
		writePrompt();
	}
};

// ── Resize handling ────────────────────────────────────────────────────────
const observer = new ResizeObserver(() => {
	fitAddon.fit();
});
observer.observe(document.getElementById("terminal")!);
