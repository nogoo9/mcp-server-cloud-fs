// src/auth/scopes.ts
// OAuth scope definitions and tool-to-scope mapping.

/** All recognized cloud-fs OAuth scopes. @category Auth */
export const SCOPES = {
	READ: "cloud-fs:read",
	WRITE: "cloud-fs:write",
	DELETE: "cloud-fs:delete",
	SEARCH: "cloud-fs:search",
	SHELL: "cloud-fs:shell",
	ADMIN: "cloud-fs:admin",
} as const;

/** A single OAuth scope value. @category Auth */
export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/** All valid scope values. @category Auth */
export const ALL_SCOPES: readonly Scope[] = Object.values(SCOPES);

/** Map tool names to the scope required to invoke them. */
const TOOL_SCOPE_MAP: Record<string, Scope> = {
	// Read tools
	read_file: SCOPES.READ,
	read_text_file: SCOPES.READ,
	read_media_file: SCOPES.READ,
	read_multiple_files: SCOPES.READ,
	read_file_range: SCOPES.READ,
	read_file_chunk: SCOPES.READ,
	// Write tools
	write_file: SCOPES.WRITE,
	edit_file: SCOPES.WRITE,
	create_directory: SCOPES.WRITE,
	// Delete tools
	delete_file: SCOPES.DELETE,
	// Search tools
	search_files: SCOPES.SEARCH,
	grep_file: SCOPES.SEARCH,
	grep_files: SCOPES.SEARCH,
	list_directory: SCOPES.SEARCH,
	list_directory_with_sizes: SCOPES.SEARCH,
	directory_tree: SCOPES.SEARCH,
	// Move tools — need both read + write
	move_file: SCOPES.WRITE,
	copy_file: SCOPES.WRITE,
	// Info tools
	get_file_info: SCOPES.READ,
	list_allowed_directories: SCOPES.READ,
	// Presigned URL tools
	get_presigned_url: SCOPES.READ,
	// Metadata & tag tools
	get_object_metadata: SCOPES.READ,
	set_object_tags: SCOPES.WRITE,
	search_by_tag: SCOPES.SEARCH,
	// Versioning tools
	list_versions: SCOPES.READ,
	restore_version: SCOPES.WRITE,
	// Shell tool
	shell: SCOPES.SHELL,
	shell_app: SCOPES.SHELL,
};

/**
 * Get the scope required for a given tool name.
 * Returns undefined if the tool is not recognized.
 *
 * @category Auth
 */
export function getRequiredScope(toolName: string): Scope | undefined {
	return TOOL_SCOPE_MAP[toolName];
}

/**
 * Check if a set of granted scopes authorizes access to a given tool.
 * The `cloud-fs:admin` scope grants access to all tools.
 *
 * @category Auth
 */
export function hasScope(grantedScopes: string[], toolName: string): boolean {
	// Admin scope overrides everything
	if (grantedScopes.includes(SCOPES.ADMIN)) return true;

	const required = getRequiredScope(toolName);
	if (!required) return false;

	return grantedScopes.includes(required);
}

/**
 * Return the list of tool names accessible with the given scopes.
 * Admin scope returns all tools.
 *
 * @category Auth
 */
export function getToolsForScopes(grantedScopes: string[]): string[] {
	if (grantedScopes.includes(SCOPES.ADMIN)) {
		return Object.keys(TOOL_SCOPE_MAP);
	}
	return Object.entries(TOOL_SCOPE_MAP)
		.filter(([, scope]) => grantedScopes.includes(scope))
		.map(([name]) => name);
}

/**
 * Check whether a tool should be registered given the granted scopes.
 * Returns `true` when no scopes are configured (backwards-compatible).
 *
 * @category Auth
 */
export function shouldRegisterTool(
	toolName: string,
	grantedScopes?: string[],
): boolean {
	// No scope filtering configured — register everything
	if (!grantedScopes) return true;
	return hasScope(grantedScopes, toolName);
}

/**
 * Parse a space-separated scope string into an array.
 *
 * @category Auth
 */
export function parseScopes(scopeString: string): string[] {
	return scopeString
		.trim()
		.split(/\s+/)
		.filter((s) => s.length > 0);
}
