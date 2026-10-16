import { describe, expect, it } from "vitest";
import { requestedWidth } from "./imageWidth";

describe("requestedWidth", () => {
  it("serves the original when w is missing or empty", () => {
    expect(requestedWidth(null)).toBe(0);
    expect(requestedWidth("")).toBe(0);
  });

  it("serves the original for a non-positive or non-numeric w", () => {
    expect(requestedWidth("0")).toBe(0);
    expect(requestedWidth("-5")).toBe(0);
    expect(requestedWidth("abc")).toBe(0);
  });

  it("clamps a real width to 64–2048", () => {
    expect(requestedWidth("400")).toBe(400);
    expect(requestedWidth("10")).toBe(64);
    expect(requestedWidth("9999")).toBe(2048);
    expect(requestedWidth("640.4")).toBe(640);
  });
});
