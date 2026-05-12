// src/auth/index.ts
// Auth module — re-exports and factory.

export type { Scope } from "./scopes.js";
export {
	ALL_SCOPES,
	getRequiredScope,
	hasScope,
	parseScopes,
	SCOPES,
} from "./scopes.js";
export type {
	EnterpriseAuthOptions,
	TokenClaims,
	VerifierOptions,
} from "./verifier.js";
export {
	EnterpriseAuthVerifier,
	ExternalTokenVerifier,
	extractBearerToken,
} from "./verifier.js";
