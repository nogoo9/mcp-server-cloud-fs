// src/auth/verifier.ts
// Token verification for external IdP mode and enterprise-managed authorization.
// Uses the `jose` library for JWT/JWKS verification.

import * as jose from "jose";

/** Decoded JWT claim payload. @category Auth */
export interface TokenClaims {
	/** Subject (user identifier). */
	sub?: string;
	/** Issued-at timestamp. */
	iat?: number;
	/** Expiry timestamp. */
	exp?: number;
	/** Issuer. */
	iss?: string;
	/** Audience (string or array). */
	aud?: string | string[];
	/** Granted scopes (space-separated string). */
	scope?: string;
	/** Email claim (common in OIDC). */
	email?: string;
	/** Client ID (for client credentials). */
	client_id?: string;
	/** All other claims. */
	[key: string]: unknown;
}

/** Configuration for {@link ExternalTokenVerifier}. @category Auth */
export interface VerifierOptions {
	/** JWKS URI to fetch signing keys from. */
	jwksUri: string;
	/** Expected issuer (validated against `iss` claim). */
	issuer?: string | undefined;
	/** Expected audience (validated against `aud` claim). */
	audience?: string | undefined;
}

/**
 * External token verifier.
 * Validates bearer JWTs against a remote JWKS endpoint.
 * Caches keys via jose's built-in JWKS cache.
 *
 * @category Auth
 */
export class ExternalTokenVerifier {
	private readonly _jwks: ReturnType<typeof jose.createRemoteJWKSet>;
	private readonly _issuer?: string | undefined;
	private readonly _audience?: string | undefined;

	constructor(options: VerifierOptions) {
		this._jwks = jose.createRemoteJWKSet(new URL(options.jwksUri));
		this._issuer = options.issuer;
		this._audience = options.audience;
	}

	/**
	 * Verify a bearer token (JWT).
	 * @param token Raw JWT string (without "Bearer " prefix).
	 * @returns Decoded claims if valid.
	 * @throws On invalid/expired token.
	 */
	async verify(token: string): Promise<TokenClaims> {
		const { payload } = await jose.jwtVerify(token, this._jwks, {
			...(this._issuer && { issuer: this._issuer }),
			...(this._audience && { audience: this._audience }),
		});
		return payload as TokenClaims;
	}
}

/** Configuration for {@link EnterpriseAuthVerifier}. @category Auth */
export interface EnterpriseAuthOptions {
	/** JWKS URI for the enterprise IdP. */
	jwksUri: string;
	/** Expected issuer for the ID-JAG (Identity Assertion JWT Authorization Grant). */
	issuer?: string | undefined;
	/** Expected audience for the ID-JAG. */
	audience?: string | undefined;
}

/**
 * Enterprise-Managed Authorization verifier.
 * Validates Identity Assertion JWT Authorization Grants (ID-JAGs) from
 * enterprise Identity Providers per the ext-auth specification.
 *
 * The flow:
 * 1. User authenticates with enterprise IdP (OIDC/SAML)
 * 2. Client exchanges IdP token for ID-JAG via Token Exchange (RFC 8693)
 * 3. Client presents ID-JAG to this MCP server (RFC 7523 §2.1)
 * 4. This verifier validates the ID-JAG's signature, issuer, audience, expiry
 *
 * @category Auth
 */
export class EnterpriseAuthVerifier {
	private readonly _verifier: ExternalTokenVerifier;

	constructor(options: EnterpriseAuthOptions) {
		this._verifier = new ExternalTokenVerifier({
			jwksUri: options.jwksUri,
			issuer: options.issuer,
			audience: options.audience,
		});
	}

	/**
	 * Validate an ID-JAG (Identity Assertion JWT Authorization Grant).
	 * @param assertion The JWT assertion from the token exchange.
	 * @returns Decoded claims with user identity.
	 */
	async validateAssertion(assertion: string): Promise<TokenClaims> {
		return this._verifier.verify(assertion);
	}
}

/**
 * Extract a bearer token from an Authorization header.
 * @returns The raw token string, or null if not present/malformed.
 *
 * @category Auth
 */
export function extractBearerToken(
	authHeader: string | null | undefined,
): string | null {
	if (!authHeader) return null;
	const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
	return match?.[1] ?? null;
}
