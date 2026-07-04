import { describe, expect, it } from "vitest";
import { enhanceImagePrompt, type ImagePreset } from "./imagePrompt";

describe("enhanceImagePrompt", () => {
  it("keeps the raw subject leading and appends a quality tail", () => {
    const out = enhanceImagePrompt("一隻在營火旁的狼");
    expect(out.startsWith("一隻在營火旁的狼")).toBe(true);
    expect(out).toContain("高解析度");
  });

  it("does not translate or drop Chinese text meant to be rendered on the image", () => {
    const raw = "海報，主標題文字「臺北市第 11 次大露營」，第 3 小隊";
    const out = enhanceImagePrompt(raw);
    expect(out).toContain("「臺北市第 11 次大露營」");
    expect(out).toContain("第 3 小隊");
  });

  it("weaves in a preset's style and aspect", () => {
    const preset: ImagePreset = {
      key: "poster",
      label: "海報",
      aspect: "3:4",
      style: "直式海報構圖，留白給標題文字",
    };
    const out = enhanceImagePrompt("營火晚會", preset);
    expect(out).toContain("營火晚會");
    expect(out).toContain("直式海報構圖");
    expect(out).toContain("畫面比例約 3:4");
  });

  it("never emits doubled punctuation when the raw ends with a period", () => {
    const out = enhanceImagePrompt("一張童軍露營的插畫。");
    expect(out).not.toContain("。。");
  });
});
