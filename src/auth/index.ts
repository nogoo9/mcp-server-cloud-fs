// src/auth/index.ts
// Auth module — re-exports and factory.

export { SCOPES, ALL_SCOPES, getRequiredScope, hasScope, parseScopes } from "./scopes.js";
export type { Scope } from "./scopes.js";

export {
	ExternalTokenVerifier,
	EnterpriseAuthVerifier,
	extractBearerToken,
} from "./verifier.js";
export type {
	TokenClaims,
	VerifierOptions,
	EnterpriseAuthOptions,
} from "./verifier.js";
