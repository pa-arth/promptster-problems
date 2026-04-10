// Regression tests for httpUrl() validation.
// Ensures malformed protocol separators (e.g. "http:example.com") are
// correctly rejected rather than silently normalized by new URL().
import { expect, test, describe } from "vitest";
import * as z from "zod/v4";

describe("httpUrl rejects malformed protocol separators", () => {
  const httpUrl = z.httpUrl();

  test("rejects http: without slashes", () => {
    const result = httpUrl.safeParse("http:example.com");
    expect(result.success).toBe(false);
  });

  test("rejects https: without slashes", () => {
    const result = httpUrl.safeParse("https:example.com");
    expect(result.success).toBe(false);
  });

  test("rejects single slash http:/", () => {
    const result = httpUrl.safeParse("http:/example.com");
    expect(result.success).toBe(false);
  });

  test("rejects single slash https:/", () => {
    const result = httpUrl.safeParse("https:/www.google.com");
    expect(result.success).toBe(false);
  });

  test("accepts valid https URL", () => {
    const result = httpUrl.safeParse("https://example.com");
    expect(result.success).toBe(true);
  });

  test("accepts valid http URL", () => {
    const result = httpUrl.safeParse("http://example.com");
    expect(result.success).toBe(true);
  });

  test("accepts valid URL with path", () => {
    const result = httpUrl.safeParse("https://example.com/path?q=1");
    expect(result.success).toBe(true);
  });
});
