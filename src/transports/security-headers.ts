// src/transports/security-headers.ts
// Framework-agnostic security headers via nosecone.
// Used by both Bun-native and Node/Express HTTP transports.

/**
 * Dynamically import nosecone and create security headers.
 * Returns a Record of header name → value pairs ready to apply to any Response.
 *
 * @param options - Custom nosecone options. See nosecone docs for available options.
 * @returns Security headers as a plain object.
 * @throws If nosecone is not installed.
 *
 * @category Transports
 */
export async function createSecurityHeaders(
	options?: Record<string, unknown>,
): Promise<Record<string, string>> {
	let nosecone: (opts?: Record<string, unknown>) => Headers;
	try {
		const mod = await import("nosecone");
		nosecone = (mod.default ?? mod) as typeof nosecone;
	} catch {
		throw new Error(
			"nosecone is required for --security-headers. Install it: npm install nosecone",
		);
	}

	const headers = nosecone(options);
	const result: Record<string, string> = {};
	headers.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

/**
 * Apply security headers to a Web Standard Response.
 * Creates a new Response with the security headers merged in.
 *
 * @param response - The original Response to augment.
 * @param securityHeaders - Pre-computed security headers from {@link createSecurityHeaders}.
 * @returns The response with security headers applied (mutates in place).
 *
 * @category Transports
 */
export function applySecurityHeaders(
	response: Response,
	securityHeaders: Record<string, string>,
): Response {
	for (const [key, value] of Object.entries(securityHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}
