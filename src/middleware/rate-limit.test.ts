// src/middleware/rate-limit.test.ts
import { describe, expect, test } from "bun:test";
import {
	InMemoryRateLimiter,
	createRateLimiter,
} from "./rate-limit.js";

describe("InMemoryRateLimiter", () => {
	test("allows requests within rate limit", async () => {
		const limiter = new InMemoryRateLimiter(600, 10); // 10/sec, burst 10
		const result = await limiter.consume("client-1");
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(9);
		expect(result.retryAfterSeconds).toBe(0);
		limiter.destroy();
	});

	test("allows burst of requests", async () => {
		const limiter = new InMemoryRateLimiter(60, 5); // 1/sec, burst 5
		for (let i = 0; i < 5; i++) {
			const result = await limiter.consume("client-1");
			expect(result.allowed).toBe(true);
		}
		limiter.destroy();
	});

	test("rejects when burst is exhausted", async () => {
		const limiter = new InMemoryRateLimiter(60, 3); // 1/sec, burst 3
		// Exhaust burst
		for (let i = 0; i < 3; i++) {
			const result = await limiter.consume("client-1");
			expect(result.allowed).toBe(true);
		}
		// Next request should be rejected
		const rejected = await limiter.consume("client-1");
		expect(rejected.allowed).toBe(false);
		expect(rejected.remaining).toBe(0);
		expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
		limiter.destroy();
	});

	test("tracks separate buckets per client", async () => {
		const limiter = new InMemoryRateLimiter(60, 2); // 1/sec, burst 2
		// Exhaust client-1
		await limiter.consume("client-1");
		await limiter.consume("client-1");
		const c1 = await limiter.consume("client-1");
		expect(c1.allowed).toBe(false);

		// client-2 should still be fresh
		const c2 = await limiter.consume("client-2");
		expect(c2.allowed).toBe(true);
		limiter.destroy();
	});

	test("refills tokens over time", async () => {
		const limiter = new InMemoryRateLimiter(6000, 1); // 100/sec, burst 1
		// Exhaust
		await limiter.consume("client-1");
		const rejected = await limiter.consume("client-1");
		expect(rejected.allowed).toBe(false);

		// Wait for refill (10ms should give ~1 token at 100/sec)
		await new Promise((r) => setTimeout(r, 15));
		const refilled = await limiter.consume("client-1");
		expect(refilled.allowed).toBe(true);
		limiter.destroy();
	});

	test("cleanup removes stale buckets", async () => {
		const limiter = new InMemoryRateLimiter(60, 10);
		await limiter.consume("client-1");
		// After cleanup, stale bucket should be removed (we can't easily test the 5min threshold,
		// but we can test the function runs without error)
		limiter.cleanup();
		limiter.destroy();
	});
});

describe("createRateLimiter", () => {
	test("returns null when rate is 0 (disabled)", () => {
		expect(createRateLimiter(0, 10)).toBeNull();
	});

	test("returns null when rate is negative", () => {
		expect(createRateLimiter(-1, 10)).toBeNull();
	});

	test("returns InMemoryRateLimiter when rate is positive", () => {
		const limiter = createRateLimiter(60, 10);
		expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
		(limiter as InMemoryRateLimiter).destroy();
	});
});
