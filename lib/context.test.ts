import { describe, expect, it } from "vitest";
import type { ContextRow } from "@/db/queries";
import { buildContext, SYSTEM_PROMPT } from "./context";

const CHAR_BUDGET = 24_000;

describe("buildContext", () => {
  it("prepends the system prompt as the first message", () => {
    const out = buildContext([{ role: "user", content: "你好" }]);
    expect(out[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ role: "user", content: "你好" });
  });

  it("preserves order and the most-recent tail", () => {
    const rows: ContextRow[] = [
      { role: "user", content: "第一" },
      { role: "assistant", content: "回一" },
      { role: "user", content: "第二" },
    ];
    const out = buildContext(rows);
    expect(out.map((m) => m.content)).toEqual([SYSTEM_PROMPT, "第一", "回一", "第二"]);
  });

  it("trims older turns to fit the char budget, keeping the newest", () => {
    // Sized so NEW(3)+big fits the budget but adding OLD(3) tips it over.
    const big = "x".repeat(CHAR_BUDGET - 4);
    const rows: ContextRow[] = [
      { role: "user", content: "OLD" },
      { role: "assistant", content: big },
      { role: "user", content: "NEW" },
    ];
    const out = buildContext(rows);
    const contents = out.map((m) => m.content);
    expect(contents[0]).toBe(SYSTEM_PROMPT);
    expect(contents).toContain("NEW"); // newest always kept
    expect(contents).not.toContain("OLD"); // oldest dropped to fit budget
  });

  it("always keeps at least the newest turn even if it alone exceeds the budget", () => {
    const huge = "y".repeat(CHAR_BUDGET + 5_000);
    const out = buildContext([{ role: "user", content: huge }]);
    expect(out).toHaveLength(2);
    expect(out[1].content).toBe(huge);
  });

  it("caps at the most recent 40 turns", () => {
    const rows: ContextRow[] = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as ContextRow["role"],
      content: `t${i}`,
    }));
    const out = buildContext(rows);
    // 1 system + at most 40 turns.
    expect(out.length).toBeLessThanOrEqual(41);
    // The very last turn is present; the very first (t0) is not.
    expect(out.at(-1)?.content).toBe("t49");
    expect(out.map((m) => m.content)).not.toContain("t0");
  });
});
