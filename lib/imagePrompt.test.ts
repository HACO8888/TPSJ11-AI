import { describe, expect, it } from "vitest";
import { enhanceImagePrompt, type ImagePreset, wantsFlatWhite } from "./imagePrompt";

describe("wantsFlatWhite", () => {
  it.each([
    "白底 logo",
    "一個隊徽 logo，純色背景",
    "設計一張名牌",
    "橫式證書／獎狀",
    "a scout emblem on a plain white background",
    "sticker with transparent background",
  ])("matches flat/plain-background graphics: %s", (t) => {
    expect(wantsFlatWhite(t)).toBe(true);
  });

  it.each([
    "一隻在營火旁的狼",
    "營火晚會的海報",
    "一隻白色的狗在草地上", // 白色 alone must NOT trigger
    "雪地裡的帳篷",
    "方形隊呼卡、活潑動感、鮮明配色", // cheer card is colourful, not flat white
  ])("does not match scenic / coloured images: %s", (t) => {
    expect(wantsFlatWhite(t)).toBe(false);
  });
});

describe("enhanceImagePrompt", () => {
  it("appends the flat-white directive only when a flat background is wanted", () => {
    expect(enhanceImagePrompt("一個隊徽 logo，純色背景")).toContain("純白平面");
    expect(enhanceImagePrompt("一隻在營火旁的狼")).not.toContain("純白平面");
  });

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
