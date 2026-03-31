/**
 * Hidden verification tests for synthetic-kv-store-001.
 * These are fetched by the CLI at submission time — the candidate doesn't
 * see them during development.
 *
 * Tests the same bugs as cache.test.ts but with different values/timing
 * to prevent hardcoded fixes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache } from './cache.js';

describe('TTLCache verification', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // ── Bug 1: get() must not return expired entries ─────────────

  it('get() returns undefined when default TTL expires', () => {
    const cache = new TTLCache(750);
    cache.set('x', 'val');
    vi.advanceTimersByTime(800);
    expect(cache.get('x')).toBeUndefined();
  });

  it('get() returns undefined when custom TTL expires', () => {
    const cache = new TTLCache(5000);
    cache.set('x', 123, 300);
    vi.advanceTimersByTime(301);
    expect(cache.get('x')).toBeUndefined();
  });

  it('get() still works for live entries', () => {
    const cache = new TTLCache(2000);
    cache.set('x', 'alive');
    vi.advanceTimersByTime(1000);
    expect(cache.get('x')).toBe('alive');
  });

  // ── Bug 2: keys() must exclude expired entries ───────────────

  it('keys() excludes all expired keys', () => {
    const cache = new TTLCache(1000);
    cache.set('a', 1, 200);
    cache.set('b', 2, 400);
    cache.set('c', 3, 800);
    vi.advanceTimersByTime(500);
    const k = cache.keys();
    expect(k).toContain('c');
    expect(k).not.toContain('a');
    expect(k).not.toContain('b');
    expect(k).toHaveLength(1);
  });

  it('keys() returns empty array when all keys expired', () => {
    const cache = new TTLCache(100);
    cache.set('x', 1);
    cache.set('y', 2);
    vi.advanceTimersByTime(200);
    expect(cache.keys()).toEqual([]);
  });

  // ── Bug 3: size must count only live entries ─────────────────

  it('size decreases as entries expire', () => {
    const cache = new TTLCache(1000);
    cache.set('a', 1, 300);
    cache.set('b', 2, 600);
    cache.set('c', 3, 900);
    expect(cache.size).toBe(3);

    vi.advanceTimersByTime(400);
    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(300);
    expect(cache.size).toBe(1);

    vi.advanceTimersByTime(300);
    expect(cache.size).toBe(0);
  });

  // ── Regression: other methods still work correctly ───────────

  it('entries() matches keys() in filtering expired', () => {
    const cache = new TTLCache(1000);
    cache.set('live', 'yes', 2000);
    cache.set('dead1', 'no', 100);
    cache.set('dead2', 'no', 200);
    vi.advanceTimersByTime(300);
    expect(cache.entries()).toEqual([['live', 'yes']]);
    expect(cache.keys()).toEqual(['live']);
    expect(cache.size).toBe(1);
  });

  it('has() is consistent with get() for expired keys', () => {
    const cache = new TTLCache(500);
    cache.set('k', 'v');
    vi.advanceTimersByTime(600);
    expect(cache.has('k')).toBe(false);
    expect(cache.get('k')).toBeUndefined();
  });

  it('set() on an existing key resets its TTL', () => {
    const cache = new TTLCache(1000);
    cache.set('k', 'v1');
    vi.advanceTimersByTime(800);
    cache.set('k', 'v2'); // reset TTL
    vi.advanceTimersByTime(800);
    // 800ms into new TTL of 1000ms — should still be alive
    expect(cache.get('k')).toBe('v2');
  });
});
