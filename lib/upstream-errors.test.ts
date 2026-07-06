import { describe, expect, it } from "vitest";
import { classifyUpstreamError, imageFailureAction, isRetryableUpstream } from "./upstream-errors";

describe("classifyUpstreamError", () => {
  it("maps 401 to auth", () => {
    expect(classifyUpstreamError(401, "").code).toBe("UPSTREAM_AUTH");
  });

  it("maps 429 to rate", () => {
    expect(classifyUpstreamError(429, "").code).toBe("UPSTREAM_RATE");
  });

  it("detects real quota/capacity exhaustion from the body", () => {
    for (const body of [
      '{"error":"RESOURCE_EXHAUSTED"}',
      "quota exceeded for this project",
      "RateLimitExceeded",
    ]) {
      expect(classifyUpstreamError(500, body).code).toBe("UPSTREAM_CAPACITY");
    }
  });

  it("classifies 'no healthy provider' as transient BUSY, not the user's quota", () => {
    // A missing provider in the gateway pool is a transient upstream availability
    // problem — NOT the user's quota. It must not be reported as "額度用盡".
    for (const body of [
      "no healthy provider available",
      "[API Service] No healthy provider found in pool for gemini-antigravity supporting model: gemini-3.1-flash-image",
    ]) {
      expect(classifyUpstreamError(500, body).code).toBe("UPSTREAM_BUSY");
    }
  });

  it("detects a no-image image-model reply from the body", () => {
    for (const body of [
      "no image in response",
      "Image editing failed",
      "image generation failed",
      "no image returned",
    ]) {
      expect(classifyUpstreamError(500, body).code).toBe("IMAGE_NO_OUTPUT");
    }
  });

  it("falls back to a generic upstream error", () => {
    expect(classifyUpstreamError(500, "some unrelated 500").code).toBe("UPSTREAM");
  });

  it("prioritises status (401/429) over body sniffing", () => {
    // A 401 whose body also mentions quota is still an auth error.
    expect(classifyUpstreamError(401, "quota exhausted").code).toBe("UPSTREAM_AUTH");
  });
});

describe("isRetryableUpstream", () => {
  it("retries transient upstream failures (provider/server/timeout/no-image)", () => {
    expect(isRetryableUpstream("UPSTREAM_BUSY", 500)).toBe(true);
    expect(isRetryableUpstream("IMAGE_NO_OUTPUT", undefined)).toBe(true);
    expect(isRetryableUpstream("IMAGE_NO_OUTPUT", 500)).toBe(true);
    expect(isRetryableUpstream("UPSTREAM_RATE", 429)).toBe(true);
    expect(isRetryableUpstream("UPSTREAM_TIMEOUT", undefined)).toBe(true);
    expect(isRetryableUpstream("UPSTREAM", 500)).toBe(true);
  });

  it("does NOT retry real quota exhaustion (retry can't help and wastes quota)", () => {
    expect(isRetryableUpstream("UPSTREAM_CAPACITY", 500)).toBe(false);
  });

  it("does NOT retry auth, a rejected prompt, or an abort", () => {
    expect(isRetryableUpstream("UPSTREAM_AUTH", 401)).toBe(false);
    // A rejected prompt surfaces as a generic UPSTREAM code but upstreamStatus 400/422.
    expect(isRetryableUpstream("UPSTREAM", 400)).toBe(false);
    expect(isRetryableUpstream("UPSTREAM", 422)).toBe(false);
    expect(isRetryableUpstream("ABORTED", 499)).toBe(false);
  });
});

describe("imageFailureAction", () => {
  it("degrades capacity and no-output to friendly chat", () => {
    expect(imageFailureAction("UPSTREAM_CAPACITY", 500)).toBe("capacity");
    expect(imageFailureAction("IMAGE_NO_OUTPUT", 500)).toBe("no-output");
  });

  it("degrades a transient no-provider BUSY to a friendly busy reply", () => {
    expect(imageFailureAction("UPSTREAM_BUSY", 500)).toBe("busy");
  });

  it("treats a 400/422 as a rejected prompt", () => {
    expect(imageFailureAction("UPSTREAM", 400)).toBe("rejected");
    expect(imageFailureAction("UPSTREAM", 422)).toBe("rejected");
  });

  it("rethrows anything else", () => {
    expect(imageFailureAction("UPSTREAM", 500)).toBe("rethrow");
    expect(imageFailureAction(undefined, undefined)).toBe("rethrow");
    expect(imageFailureAction("ABORTED", 499)).toBe("rethrow");
  });
});
