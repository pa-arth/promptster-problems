/**
 * Date parser round-trip verification tests.
 * The parser must preserve the original timezone offset when an ISO-8601
 * string is parsed and re-formatted — not silently normalize to UTC.
 */
import { describe, it, expect } from 'vitest';
import { parseISO, formatISO } from '../date-parser.js';

describe('date-parser ISO round-trip', () => {
  // ── Core fix: timezone offset must survive round-trip ────────

  it('preserves a positive UTC offset (Asia/Tokyo, +09:00)', () => {
    const input = '2026-01-15T08:30:00+09:00';
    expect(formatISO(parseISO(input))).toBe(input);
  });

  it('preserves a negative UTC offset (America/New_York DST, -04:00)', () => {
    const input = '2026-07-04T12:00:00-04:00';
    expect(formatISO(parseISO(input))).toBe(input);
  });

  it('preserves UTC (Z) without rewriting it as +00:00', () => {
    const input = '2026-03-21T00:00:00Z';
    expect(formatISO(parseISO(input))).toBe(input);
  });

  it('preserves a half-hour offset (Asia/Kolkata, +05:30)', () => {
    const input = '2026-11-09T18:45:00+05:30';
    expect(formatISO(parseISO(input))).toBe(input);
  });

  // ── Regression: parsing remains correct for the absolute instant ──

  it('parses to the same UTC instant regardless of source offset', () => {
    const a = parseISO('2026-01-15T08:30:00+09:00').getTime();
    const b = parseISO('2026-01-14T23:30:00Z').getTime();
    expect(a).toBe(b);
  });

  // ── Public API surface guarantee ──────────────────────────────

  it('does not change the function signatures used by callers', () => {
    expect(typeof parseISO).toBe('function');
    expect(parseISO.length).toBe(1);
    expect(typeof formatISO).toBe('function');
    expect(formatISO.length).toBe(1);
  });
});
