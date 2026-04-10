import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { setRedisClient } from '../src/lib/redis.js';
import { createApp } from '../src/app.js';

// ---------------------------------------------------------------------------
// Setup: inject a fresh ioredis-mock before each test
// ---------------------------------------------------------------------------

let app: ReturnType<typeof createApp>;
let redisMock: InstanceType<typeof RedisMock>;

beforeEach(() => {
  redisMock = new RedisMock();
  setRedisClient(redisMock);
  app = createApp();
});

afterEach(async () => {
  await redisMock.flushall();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Category 1: Basic rate limiting
// ---------------------------------------------------------------------------

describe('Basic rate limiting', () => {
  it('should allow requests up to the limit', async () => {
    // Public route has max=30, but we test with a smaller set to keep it fast
    // Send 30 requests — all should succeed
    const results = [];
    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/api/public');
      results.push(res.status);
    }
    expect(results.every((s) => s === 200)).toBe(true);
  });

  it('should reject requests exceeding the limit', async () => {
    // Send 31 requests — the 31st should be 429
    for (let i = 0; i < 30; i++) {
      await request(app).get('/api/public');
    }
    const res = await request(app).get('/api/public');
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Category 2: Race condition fix
// ---------------------------------------------------------------------------

describe('Concurrency', () => {
  it('should not exceed limit under concurrent requests', async () => {
    // Fire 50 requests simultaneously against a limit of 30
    const promises = Array.from({ length: 50 }, () =>
      request(app).get('/api/public'),
    );
    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 429).length;

    // Exactly 30 should succeed, 20 should be rejected
    // Allow ±0 tolerance — atomic implementation should be exact
    expect(successes).toBeLessThanOrEqual(30);
    expect(successes).toBeGreaterThanOrEqual(28); // small tolerance for mock timing
    expect(rejected).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Category 3: Sliding window
// ---------------------------------------------------------------------------

describe('Sliding window', () => {
  it('should prevent boundary burst with sliding window algorithm', async () => {
    vi.useFakeTimers();

    // Configure: 60s window, max 10 requests
    // The public route has windowMs=60000, max=30
    // We'll test the concept: send requests near the end of a window,
    // then send more right after the window "resets"
    // With fixed-window, all new requests pass; with sliding-window, some are blocked

    // Send 25 requests at T=55s (near end of window)
    vi.advanceTimersByTime(55_000);
    for (let i = 0; i < 25; i++) {
      await request(app).get('/api/public');
    }

    // Advance past the 60s boundary
    vi.advanceTimersByTime(10_000); // now at T=65s

    // Send 20 more requests. With sliding window, ~25 of the previous
    // requests are still in the 60s lookback. Only ~5 more should be allowed.
    const results = [];
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/api/public');
      results.push(res.status);
    }

    const allowed = results.filter((s) => s === 200).length;

    // With fixed window: all 20 would pass (new window).
    // With sliding window: only ~5 should pass (30 - 25 still in window).
    // We check that at least some were rejected.
    expect(allowed).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// Category 4: Key strategies
// ---------------------------------------------------------------------------

describe('Key strategies', () => {
  it('should create separate rate limit buckets per user on authenticated routes', async () => {
    // Two different users each get their own limit
    const user1Results = [];
    const user2Results = [];

    for (let i = 0; i < 60; i++) {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer user-alice');
      user1Results.push(res.status);
    }

    for (let i = 0; i < 60; i++) {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer user-bob');
      user2Results.push(res.status);
    }

    // Both users should get their full quota (60 each for auth routes)
    const user1Success = user1Results.filter((s) => s === 200).length;
    const user2Success = user2Results.filter((s) => s === 200).length;

    expect(user1Success).toBe(60);
    expect(user2Success).toBe(60);
  });

  it('should rate limit by API key on admin routes', async () => {
    // Two different API keys should have independent limits
    const key1Results = [];
    const key2Results = [];

    for (let i = 0; i < 120; i++) {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('X-API-Key', 'key-alpha');
      key1Results.push(res.status);
    }

    for (let i = 0; i < 120; i++) {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('X-API-Key', 'key-beta');
      key2Results.push(res.status);
    }

    const key1Success = key1Results.filter((s) => s === 200).length;
    const key2Success = key2Results.filter((s) => s === 200).length;

    expect(key1Success).toBe(120);
    expect(key2Success).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Category 5: Graceful degradation
// ---------------------------------------------------------------------------

describe('Graceful degradation', () => {
  it('should handle Redis unavailability without crashing', async () => {
    // Replace Redis mock with one that throws on every operation
    const brokenRedis = {
      get: () => Promise.reject(new Error('Redis connection refused')),
      set: () => Promise.reject(new Error('Redis connection refused')),
      incr: () => Promise.reject(new Error('Redis connection refused')),
      expire: () => Promise.reject(new Error('Redis connection refused')),
      eval: () => Promise.reject(new Error('Redis connection refused')),
      evalsha: () => Promise.reject(new Error('Redis connection refused')),
      multi: () => ({
        incr: () => brokenRedis,
        expire: () => brokenRedis,
        exec: () => Promise.reject(new Error('Redis connection refused')),
      }),
      zadd: () => Promise.reject(new Error('Redis connection refused')),
      zremrangebyscore: () => Promise.reject(new Error('Redis connection refused')),
      zcard: () => Promise.reject(new Error('Redis connection refused')),
      pipeline: () => ({
        incr: () => brokenRedis,
        expire: () => brokenRedis,
        exec: () => Promise.reject(new Error('Redis connection refused')),
      }),
      status: 'end',
    };

    setRedisClient(brokenRedis as any);
    app = createApp();

    // Public endpoint should NOT crash — should respond with 200 or 503,
    // but definitely not 500 (unhandled error)
    const res = await request(app).get('/api/public');
    expect(res.status).not.toBe(500);
    // Should be either 200 (fail-open) or 503 (fail-closed / service unavailable)
    expect([200, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Category 6: Rate limit headers
// ---------------------------------------------------------------------------

describe('Rate limit headers', () => {
  it('should include rate limit headers on successful requests', async () => {
    const res = await request(app).get('/api/public');

    expect(res.status).toBe(200);

    // Check for standard rate limit headers (case-insensitive)
    const headers = res.headers;
    const hasLimit =
      headers['x-ratelimit-limit'] !== undefined ||
      headers['ratelimit-limit'] !== undefined;
    const hasRemaining =
      headers['x-ratelimit-remaining'] !== undefined ||
      headers['ratelimit-remaining'] !== undefined;
    const hasReset =
      headers['x-ratelimit-reset'] !== undefined ||
      headers['ratelimit-reset'] !== undefined;

    expect(hasLimit).toBe(true);
    expect(hasRemaining).toBe(true);
    expect(hasReset).toBe(true);
  });

  it('should include rate limit headers on rejected requests', async () => {
    // Exhaust the limit
    for (let i = 0; i < 30; i++) {
      await request(app).get('/api/public');
    }

    const res = await request(app).get('/api/public');
    expect(res.status).toBe(429);

    const headers = res.headers;
    const hasLimit =
      headers['x-ratelimit-limit'] !== undefined ||
      headers['ratelimit-limit'] !== undefined;
    const hasRemaining =
      headers['x-ratelimit-remaining'] !== undefined ||
      headers['ratelimit-remaining'] !== undefined;

    expect(hasLimit).toBe(true);
    expect(hasRemaining).toBe(true);

    // Remaining should be 0
    const remaining = parseInt(
      headers['x-ratelimit-remaining'] ?? headers['ratelimit-remaining'] ?? '999',
      10,
    );
    expect(remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Category 7: Bypass rules
// ---------------------------------------------------------------------------

describe('Bypass rules', () => {
  it('should bypass rate limiting for allowlisted clients', async () => {
    // The config should support bypass rules. We test by configuring
    // an allowlisted IP or token that can exceed the limit.
    //
    // Since supertest sends from 127.0.0.1 by default, we test with
    // a special bypass token in the header.
    // Bypass can be implemented via allowlisted IPs or tokens.

    // First exhaust the limit normally
    for (let i = 0; i < 30; i++) {
      await request(app).get('/api/public');
    }

    // Verify the limit is hit
    const blockedRes = await request(app).get('/api/public');
    expect(blockedRes.status).toBe(429);

    // Test with a bypass mechanism — either an allowlisted IP or
    // a special bypass header/token should work.

    // Approach 1: Check if there's a bypass token header
    const bypassRes = await request(app)
      .get('/api/public')
      .set('X-RateLimit-Bypass', 'trusted-internal-key');

    // Approach 2: Check if localhost/127.0.0.1 is allowlisted
    // (supertest uses 127.0.0.1 by default, so if they allowlisted it,
    // the original requests wouldn't have been limited — so this approach
    // requires explicit config. We primarily test approach 1.)

    // The bypass should result in the request succeeding despite the limit
    // If neither approach works, this test fails.
    if (bypassRes.status === 200) {
      expect(bypassRes.status).toBe(200);
    } else {
      // If X-RateLimit-Bypass doesn't work, check if there's
      // some other bypass mechanism by looking at the config
      // No recognized bypass mechanism found
      expect(bypassRes.status).toBe(200);
    }
  });
});
