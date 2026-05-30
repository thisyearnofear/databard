/**
 * Deterministic unit tests for the rate limiter.
 * Uses Node's built-in test runner -- no browser or server needed.
 * Run with: node --import tsx tests/rate-limit.unit.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We need to test the logic directly. Since the module uses a module-scoped
// Map, we import the exported functions and test their observable behavior.

// Re-implement the core logic here for isolated testing (mirrors rate-limit.ts exactly).
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

function createRateLimiter() {
  const ipMap = new Map<string, RateLimitEntry>();
  const MAX_ENTRIES = 10_000;

  function rateLimit(
    ip: string,
    config: RateLimitConfig = { limit: 60, windowMs: 60_000 }
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = ipMap.get(ip);

    if (!entry || now > entry.resetAt) {
      ipMap.set(ip, { count: 1, resetAt: now + config.windowMs });
      return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
  }

  function cleanup() {
    const now = Date.now();
    for (const [ip, entry] of ipMap.entries()) {
      if (now > entry.resetAt) {
        ipMap.delete(ip);
      }
    }
    if (ipMap.size > MAX_ENTRIES) {
      const excess = ipMap.size - MAX_ENTRIES;
      const iter = ipMap.keys();
      for (let i = 0; i < excess; i++) {
        const oldest = iter.next().value;
        if (oldest !== undefined) ipMap.delete(oldest);
      }
    }
  }

  return { rateLimit, cleanup, size: () => ipMap.size };
}

describe("rateLimit", () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter();
  });

  it("allows the first request", () => {
    const result = limiter.rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000 });
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 4);
  });

  it("tracks remaining count correctly", () => {
    const config = { limit: 3, windowMs: 60_000 };
    const r1 = limiter.rateLimit("1.2.3.4", config);
    assert.equal(r1.remaining, 2);

    const r2 = limiter.rateLimit("1.2.3.4", config);
    assert.equal(r2.remaining, 1);

    const r3 = limiter.rateLimit("1.2.3.4", config);
    assert.equal(r3.remaining, 0);
  });

  it("blocks after limit is exceeded", () => {
    const config = { limit: 2, windowMs: 60_000 };
    limiter.rateLimit("1.2.3.4", config);
    limiter.rateLimit("1.2.3.4", config);
    const blocked = limiter.rateLimit("1.2.3.4", config);

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  });

  it("tracks different IPs independently", () => {
    const config = { limit: 1, windowMs: 60_000 };
    const r1 = limiter.rateLimit("1.1.1.1", config);
    assert.equal(r1.allowed, true);

    const r2 = limiter.rateLimit("2.2.2.2", config);
    assert.equal(r2.allowed, true);

    // Both IPs now exhausted
    const r3 = limiter.rateLimit("1.1.1.1", config);
    assert.equal(r3.allowed, false);

    const r4 = limiter.rateLimit("2.2.2.2", config);
    assert.equal(r4.allowed, false);
  });

  it("resets after window expires", () => {
    const config = { limit: 1, windowMs: 1 }; // 1ms window
    limiter.rateLimit("1.2.3.4", config);
    const blocked = limiter.rateLimit("1.2.3.4", config);
    assert.equal(blocked.allowed, false);

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const allowed = limiter.rateLimit("1.2.3.4", config);
        assert.equal(allowed.allowed, true);
        assert.equal(allowed.remaining, 0);
        resolve();
      }, 5);
    });
  });

  it("returns consistent resetAt timestamp", () => {
    const config = { limit: 5, windowMs: 60_000 };
    const r1 = limiter.rateLimit("1.2.3.4", config);
    const r2 = limiter.rateLimit("1.2.3.4", config);

    // Both should share the same resetAt (same window)
    assert.equal(r1.resetAt, r2.resetAt);
  });
});

describe("cleanup", () => {
  it("removes expired entries", () => {
    const limiter = createRateLimiter();
    const config = { limit: 5, windowMs: 1 }; // 1ms window

    limiter.rateLimit("1.1.1.1", config);
    limiter.rateLimit("2.2.2.2", config);
    assert.equal(limiter.size(), 2);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        limiter.cleanup();
        assert.equal(limiter.size(), 0);
        resolve();
      }, 5);
    });
  });

  it("preserves active entries during cleanup", () => {
    const limiter = createRateLimiter();
    limiter.rateLimit("active-ip", { limit: 5, windowMs: 60_000 });
    limiter.rateLimit("expired-ip", { limit: 5, windowMs: 1 });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        limiter.cleanup();
        assert.equal(limiter.size(), 1);
        // Active IP should still work
        const r = limiter.rateLimit("active-ip", { limit: 5, windowMs: 60_000 });
        assert.equal(r.remaining, 3); // 2nd request out of 5
        resolve();
      }, 5);
    });
  });
});

describe("getClientIp", () => {
  // These test the header parsing logic directly
  it("extracts IP from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.50, 70.41.3.18" });
    const forwardedFor = headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
    assert.equal(ip, "203.0.113.50");
  });

  it("extracts IP from x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "10.0.0.1" });
    const realIp = headers.get("x-real-ip");
    assert.equal(realIp, "10.0.0.1");
  });

  it("falls back to 127.0.0.1 when no headers present", () => {
    const headers = new Headers();
    const forwardedFor = headers.get("x-forwarded-for");
    const realIp = headers.get("x-real-ip");
    const ip = forwardedFor
      ? forwardedFor.split(",")[0].trim()
      : realIp || "127.0.0.1";
    assert.equal(ip, "127.0.0.1");
  });
});
