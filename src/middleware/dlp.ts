// src/middleware/dlp.ts
// Data Loss Prevention — regex-based content sanitization middleware.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * A named regex pattern for DLP redaction.
 *
 * @category Middleware
 */
export interface DlpPattern {
	/** Human-readable name for the pattern (e.g. "AWS Access Key"). */
	name: string;
	/** Regex to match sensitive content. Must use the `g` flag. */
	pattern: RegExp;
	/** Replacement string (e.g. "[REDACTED:AWS_KEY]"). */
	replacement: string;
}

/**
 * Default DLP patterns shipped with cloud-fs.
 *
 * @category Middleware
 */
export const DEFAULT_DLP_PATTERNS: DlpPattern[] = [
	{
		name: "AWS Access Key",
		pattern: /AKIA[0-9A-Z]{16}/g,
		replacement: "[REDACTED:AWS_KEY]",
	},
	{
		name: "AWS Secret Key",
		pattern:
			/(?<=aws_secret_access_key\s*[=:]\s*)[A-Za-z0-9/+=]{40}(?=\s|$|")/gi,
		replacement: "[REDACTED:AWS_SECRET]",
	},
	{
		name: "Generic Secret (40-char hex)",
		pattern: /(?<=secret[_-]?key\s*[=:]\s*["']?)[a-f0-9]{40}(?=["']?\s|$)/gi,
		replacement: "[REDACTED:SECRET]",
	},
	{
		name: "Email Address",
		pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
		replacement: "[REDACTED:EMAIL]",
	},
	{
		name: "US SSN",
		pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
		replacement: "[REDACTED:SSN]",
	},
	{
		name: "Credit Card (16-digit)",
		pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
		replacement: "[REDACTED:CC]",
	},
	{
		name: "JWT Token",
		pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
		replacement: "[REDACTED:JWT]",
	},
	{
		name: "OpenAI API Key",
		pattern: /sk-[A-Za-z0-9]{20,}/g,
		replacement: "[REDACTED:API_KEY]",
	},
	{
		name: "Stripe Key",
		pattern: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}/g,
		replacement: "[REDACTED:API_KEY]",
	},
];

/**
 * Apply DLP redaction patterns to a text string.
 *
 * @returns The sanitized text and the number of redactions applied.
 *
 * @category Middleware
 */
export function sanitizeContent(
	text: string,
	patterns: DlpPattern[],
): { sanitized: string; redactionCount: number } {
	let sanitized = text;
	let redactionCount = 0;

	for (const p of patterns) {
		// Reset regex lastIndex for safety (since we use `g` flag)
		p.pattern.lastIndex = 0;
		const matches = sanitized.match(p.pattern);
		if (matches) {
			redactionCount += matches.length;
			sanitized = sanitized.replace(p.pattern, p.replacement);
		}
	}

	return { sanitized, redactionCount };
}

/**
 * Wrap an MCP server's `registerTool` to apply DLP sanitization
 * on all text content in tool responses.
 *
 * Must be called BEFORE tools are registered.
 *
 * @category Middleware
 */
export function applyDlpWrapper(
	server: McpServer,
	patterns?: DlpPattern[],
): void {
	const dlpPatterns = patterns ?? DEFAULT_DLP_PATTERNS;
	const original = server.registerTool.bind(server);

	// biome-ignore lint/suspicious/noExplicitAny: wrapping generic registerTool overloads
	(server as any).registerTool = (name: string, ...rest: any[]) => {
		// Last argument is the handler callback
		const handler = rest[rest.length - 1];
		if (typeof handler === "function") {
			rest[rest.length - 1] = async (...handlerArgs: unknown[]) => {
				const result = await handler(...handlerArgs);
				// Sanitize text content in the response
				if (result?.content && Array.isArray(result.content)) {
					for (const item of result.content) {
						if (item.type === "text" && typeof item.text === "string") {
							const { sanitized } = sanitizeContent(item.text, dlpPatterns);
							item.text = sanitized;
						}
					}
				}
				return result;
			};
		}
		// biome-ignore lint/suspicious/noExplicitAny: calling original overloaded registerTool
		return (original as any)(name, ...rest);
	};
}
