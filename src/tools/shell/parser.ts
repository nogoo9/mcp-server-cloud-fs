// src/tools/shell/parser.ts
// Tokenizer and pipeline parser for shell commands.
// Handles quoting, pipes (|), redirections (>, >>, <),
// and command list operators (&&, ||, ;).

/** A single stage in a shell pipeline. */
export interface PipelineStage {
	/** Command name (e.g. "ls", "grep"). */
	command: string;
	/** Argument tokens. */
	args: string[];
}

/** Parsed redirection attached to the pipeline. */
export interface Redirect {
	/** "write" = >, "append" = >>, "read" = < */
	mode: "write" | "append" | "read";
	/** Cloud URI target. */
	path: string;
}

export interface ParsedPipeline {
	stages: PipelineStage[];
	/** Input redirection (< file) applies to the first stage. */
	inputRedirect: Redirect | null;
	/** Output redirection (> file or >> file) applies to the last stage. */
	outputRedirect: Redirect | null;
}

/** Operator that joins two adjacent pipelines in a command list. */
export type Operator = "&&" | "||" | ";";

/** A pipeline paired with the operator that follows it (null = last entry). */
export interface CommandListEntry {
	pipeline: ParsedPipeline;
	/** The operator *after* this entry; null means this is the final entry. */
	operator: Operator | null;
}

/** An ordered list of pipelines connected by &&, ||, or ;. */
export type CommandList = CommandListEntry[];

/**
 * Tokenize a shell command string.
 * Handles single quotes, double quotes, and backslash escapes.
 */
export function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	let escaping = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i]!;

		if (escaping) {
			current += ch;
			escaping = false;
			continue;
		}

		if (ch === "\\" && !inSingle) {
			escaping = true;
			continue;
		}

		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			continue;
		}

		if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
			continue;
		}

		if (!inSingle && !inDouble && (ch === " " || ch === "\t")) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		current += ch;
	}

	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

/**
 * Parse a tokenized command into a pipeline with optional redirections.
 *
 * Supports:
 *   cmd1 | cmd2 | cmd3
 *   cmd < input.txt
 *   cmd > output.txt
 *   cmd >> output.txt
 *   cmd < in.txt | cmd2 > out.txt
 */
export function parsePipeline(tokens: string[]): ParsedPipeline {
	let inputRedirect: Redirect | null = null;
	let outputRedirect: Redirect | null = null;

	// First pass: extract redirections and collect remaining tokens
	const cleaned: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i]!;

		if (tok === ">>") {
			const path = tokens[++i];
			if (!path)
				throw new Error("shell: syntax error — expected path after >>");
			outputRedirect = { mode: "append", path };
		} else if (tok === ">") {
			const path = tokens[++i];
			if (!path) throw new Error("shell: syntax error — expected path after >");
			outputRedirect = { mode: "write", path };
		} else if (tok === "<") {
			const path = tokens[++i];
			if (!path) throw new Error("shell: syntax error — expected path after <");
			inputRedirect = { mode: "read", path };
		} else if (tok.startsWith(">>") && tok.length > 2) {
			// Fused: >>path
			outputRedirect = { mode: "append", path: tok.slice(2) };
		} else if (tok.startsWith(">") && tok.length > 1 && !tok.startsWith(">>")) {
			// Fused: >path
			outputRedirect = { mode: "write", path: tok.slice(1) };
		} else if (tok.startsWith("<") && tok.length > 1) {
			// Fused: <path
			inputRedirect = { mode: "read", path: tok.slice(1) };
		} else {
			cleaned.push(tok);
		}
	}

	// Second pass: split on pipe
	const stages: PipelineStage[] = [];
	let current: string[] = [];

	for (const tok of cleaned) {
		if (tok === "|") {
			if (current.length === 0) {
				throw new Error("shell: syntax error — empty command before |");
			}
			stages.push({ command: current[0]!, args: current.slice(1) });
			current = [];
		} else {
			current.push(tok);
		}
	}

	if (current.length === 0) {
		throw new Error("shell: syntax error — empty command");
	}
	stages.push({ command: current[0]!, args: current.slice(1) });

	return { stages, inputRedirect, outputRedirect };
}

/**
 * Parse a raw command string into a structured pipeline.
 * @deprecated Use {@link parseCommandList} for multi-command support.
 */
export function parseCommand(command: string): ParsedPipeline {
	const tokens = tokenize(command.trim());
	if (tokens.length === 0) {
		throw new Error("shell: empty command");
	}
	return parsePipeline(tokens);
}

/** Tokens that act as command-list separators (standalone only). */
const LIST_OPERATORS = new Set(["&&", "||", ";"]);

/**
 * Parse a raw command string that may contain &&, ||, or ; operators into a
 * {@link CommandList}. Each entry holds one pipeline and the operator that
 * follows it (null for the last entry).
 *
 * Quoting is fully respected: `echo "a&&b"` produces a single-entry list.
 *
 * @example
 * parseCommandList("echo a && echo b");
 * // → [{ pipeline: …echo a…, operator: "&&" }, { pipeline: …echo b…, operator: null }]
 */
export function parseCommandList(command: string): CommandList {
	const tokens = tokenize(command.trim());
	if (tokens.length === 0) {
		throw new Error("shell: empty command");
	}

	const list: CommandList = [];
	let segment: string[] = [];

	for (const tok of tokens) {
		if (LIST_OPERATORS.has(tok)) {
			if (segment.length === 0) {
				throw new Error(`shell: syntax error — empty command before '${tok}'`);
			}
			list.push({
				pipeline: parsePipeline(segment),
				operator: tok as Operator,
			});
			segment = [];
		} else {
			segment.push(tok);
		}
	}

	// Last segment (no trailing operator)
	if (segment.length === 0) {
		const lastOp = list[list.length - 1]?.operator;
		throw new Error(`shell: syntax error — empty command after '${lastOp}'`);
	}
	list.push({ pipeline: parsePipeline(segment), operator: null });

	return list;
}
