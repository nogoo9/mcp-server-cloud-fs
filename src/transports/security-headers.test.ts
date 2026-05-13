// src/transports/security-headers.test.ts
import { describe, expect, test } from "bun:test";
import { createSecurityHeaders } from "./security-headers.js";

describe("createSecurityHeaders", () => {
	test("returns default security headers", async () => {
		const headers = await createSecurityHeaders();

		// Nosecone sets these by default (same as helmet defaults)
		expect(headers["x-content-type-options"]).toBe("nosniff");
		expect(headers["x-frame-options"]).toBeDefined();
		expect(headers["content-security-policy"]).toBeDefined();
	});

	test("returns headers as a plain object", async () => {
		const headers = await createSecurityHeaders();

		expect(typeof headers).toBe("object");
		// Should have multiple headers
		expect(Object.keys(headers).length).toBeGreaterThan(3);
	});

	test("accepts custom options", async () => {
		// Disable CSP to verify options passthrough
		const headers = await createSecurityHeaders({
			contentSecurityPolicy: false,
		});

		expect(headers["content-security-policy"]).toBeUndefined();
		// Other headers should still be present
		expect(headers["x-content-type-options"]).toBe("nosniff");
	});
});
