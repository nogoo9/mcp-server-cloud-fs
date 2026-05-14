// src/middleware/audit.ts
// Structured audit logging for MCP tool invocations.

import { getRequiredScope } from "../auth/scopes.js";

/**
 * A structured audit log entry emitted for each tool invocation.
 * @category Middleware
 */
export interface AuditEntry {
	timestamp: string;
	level: "info" | "error";
	event: "tool_invocation";
	tool: string;
	scope: string | undefined;
	resource: string | undefined;
	args: Record<string, unknown>;
	duration_ms: number;
	success: boolean;
	error?: string;
}

/** Writable destination for audit entries. */
export interface AuditSink {
	write(entry: AuditEntry): void;
}

/** Writes audit entries as JSON lines to stderr. */
export class StderrAuditSink implements AuditSink {
	write(entry: AuditEntry): void {
		process.stderr.write(`${JSON.stringify(entry)}\n`);
	}
}

/** Writes audit entries as JSON lines to a file via an append stream. */
export class FileAuditSink implements AuditSink {
	private readonly fd: number;

	constructor(filePath: string) {
		const fs = require("node:fs") as typeof import("node:fs");
		this.fd = fs.openSync(filePath, "a");
	}

	write(entry: AuditEntry): void {
		const fs = require("node:fs") as typeof import("node:fs");
		fs.writeSync(this.fd, `${JSON.stringify(entry)}\n`);
	}
}

/** Extract the primary resource URI from tool arguments. */
function extractResource(args: Record<string, unknown>): string | undefined {
	// Most tools use `path`, some use `source`/`destination`
	const path = args.path ?? args.source;
	return typeof path === "string" ? path : undefined;
}

/** Remove large content bodies and truncate long strings. */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(args)) {
		if (key === "content" && typeof value === "string" && value.length > 200) {
			sanitized[key] = `[${value.length} chars]`;
		} else if (typeof value === "string" && value.length > 500) {
			sanitized[key] = `${value.slice(0, 500)}... [truncated]`;
		} else {
			sanitized[key] = value;
		}
	}
	return sanitized;
}

/**
 * Core audit logger. Call {@link logToolCall} to record a tool invocation.
 *
 * @category Middleware
 */
export class AuditLogger {
	constructor(private readonly sink: AuditSink) {}

	logToolCall(
		toolName: string,
		args: Record<string, unknown>,
		result: { success: boolean; error?: string; duration_ms: number },
	): void {
		const entry: AuditEntry = {
			timestamp: new Date().toISOString(),
			level: result.success ? "info" : "error",
			event: "tool_invocation",
			tool: toolName,
			scope: getRequiredScope(toolName),
			resource: extractResource(args),
			args: sanitizeArgs(args),
			duration_ms: Math.round(result.duration_ms * 100) / 100,
			success: result.success,
			...(result.error !== undefined && { error: result.error }),
		};
		this.sink.write(entry);
	}
}
