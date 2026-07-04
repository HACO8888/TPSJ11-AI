import { describe, expect, it } from "vitest";
import { classifyUpstreamError, imageFailureAction } from "./upstream-errors";

describe("classifyUpstreamError", () => {
  it("maps 401 to auth", () => {
    expect(classifyUpstreamError(401, "").code).toBe("UPSTREAM_AUTH");
  });

  it("maps 429 to rate", () => {
    expect(classifyUpstreamError(429, "").code).toBe("UPSTREAM_RATE");
  });

  it("detects provider capacity/quota exhaustion from the body", () => {
    for (const body of [
      '{"error":"RESOURCE_EXHAUSTED"}',
      "quota exceeded for this project",
      "no healthy provider available",
      "RateLimitExceeded",
    ]) {
      expect(classifyUpstreamError(500, body).code).toBe("UPSTREAM_CAPACITY");
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

describe("imageFailureAction", () => {
  it("degrades capacity and no-output to friendly chat", () => {
    expect(imageFailureAction("UPSTREAM_CAPACITY", 500)).toBe("capacity");
    expect(imageFailureAction("IMAGE_NO_OUTPUT", 500)).toBe("no-output");
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
