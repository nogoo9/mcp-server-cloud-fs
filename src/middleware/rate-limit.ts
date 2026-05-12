// src/middleware/rate-limit.ts
// Token bucket rate limiter — in-memory and Redis backends.

export interface RateLimitResult {
	/** Whether the request is allowed. */
	allowed: boolean;
	/** Number of remaining tokens. */
	remaining: number;
	/** Seconds until the bucket refills enough for one more request. */
	retryAfterSeconds: number;
}

export interface RateLimiter {
	/** Check if a request from the given key (IP/client) is allowed. */
	consume(key: string): Promise<RateLimitResult>;
	/** Cleanup expired buckets. */
	cleanup(): void;
}

interface Bucket {
	tokens: number;
	lastRefill: number;
}

/**
 * In-memory token bucket rate limiter.
 * Suitable for single-process deployments.
 */
export class InMemoryRateLimiter implements RateLimiter {
	private readonly _buckets = new Map<string, Bucket>();
	private readonly _ratePerSecond: number;
	private readonly _burstCapacity: number;
	private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

	/**
	 * @param ratePerMinute Sustained rate in requests per minute.
	 * @param burstCapacity Maximum burst size (tokens).
	 */
	constructor(ratePerMinute: number, burstCapacity: number) {
		this._ratePerSecond = ratePerMinute / 60;
		this._burstCapacity = burstCapacity;

		// Periodic cleanup every 60 seconds
		this._cleanupTimer = setInterval(() => this.cleanup(), 60_000);
		// Don't prevent process from exiting
		if (this._cleanupTimer && "unref" in this._cleanupTimer) {
			(this._cleanupTimer as NodeJS.Timeout).unref();
		}
	}

	async consume(key: string): Promise<RateLimitResult> {
		const now = Date.now() / 1000; // seconds
		let bucket = this._buckets.get(key);

		if (!bucket) {
			bucket = { tokens: this._burstCapacity, lastRefill: now };
			this._buckets.set(key, bucket);
		}

		// Refill tokens based on elapsed time
		const elapsed = now - bucket.lastRefill;
		bucket.tokens = Math.min(
			this._burstCapacity,
			bucket.tokens + elapsed * this._ratePerSecond,
		);
		bucket.lastRefill = now;

		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return {
				allowed: true,
				remaining: Math.floor(bucket.tokens),
				retryAfterSeconds: 0,
			};
		}

		// Not enough tokens — calculate retry-after
		const deficit = 1 - bucket.tokens;
		const retryAfterSeconds = Math.ceil(deficit / this._ratePerSecond);

		return {
			allowed: false,
			remaining: 0,
			retryAfterSeconds,
		};
	}

	cleanup(): void {
		const now = Date.now() / 1000;
		const staleThreshold = 300; // 5 minutes
		for (const [key, bucket] of this._buckets) {
			if (now - bucket.lastRefill > staleThreshold) {
				this._buckets.delete(key);
			}
		}
	}

	/** Stop the cleanup timer. */
	destroy(): void {
		if (this._cleanupTimer) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
	}
}

/**
 * Create a rate limiter based on configuration.
 * Returns null if rate limiting is disabled (ratePerMinute <= 0).
 */
export function createRateLimiter(
	ratePerMinute: number,
	burstCapacity: number,
): RateLimiter | null {
	if (ratePerMinute <= 0) return null;
	return new InMemoryRateLimiter(ratePerMinute, burstCapacity);
}
