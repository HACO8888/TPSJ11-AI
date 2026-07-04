import { describe, expect, it } from "vitest";
import {
  extractSaveName,
  hasCloudSaveCue,
  hasImageCue,
  isBareImageRequest,
  isLikelyImageEdit,
  resolveSaveBaseName,
} from "./intent-rules";

describe("hasImageCue", () => {
  it.each([
    "幫我做一張海報",
    "生成一張營火插畫",
    "畫一隻狼",
    "來一張圖",
    "我要圖片",
    "幫我做名牌",
    "draw a poster",
    "logo",
  ])("matches image-ish request: %s", (t) => {
    expect(hasImageCue(t)).toBe(true);
  });

  it.each([
    "這活動在哪辦",
    "謝謝",
    "帳篷怎麼搭",
    "報名名單在哪", // 名單 must NOT match the 名牌 cue
  ])("skips plain chat: %s", (t) => {
    expect(hasImageCue(t)).toBe(false);
  });
});

describe("isBareImageRequest", () => {
  it.each(["幫我畫", "我要一張圖", "畫個東西"])("flags subject-less request: %s", (t) => {
    expect(isBareImageRequest(t)).toBe(true);
  });

  it.each([
    "幫我畫一隻狼", // has a concrete subject
    "畫一張營地路線圖",
    "幫我畫一張超級詳細的營地全區平面圖包含所有帳篷", // >14 chars
  ])("does not flag concrete request: %s", (t) => {
    expect(isBareImageRequest(t)).toBe(false);
  });
});

describe("isLikelyImageEdit", () => {
  it.each([
    "卡通版的",
    "換成藍色背景",
    "伸出貓爪",
    "再大一點",
  ])("flags terse edit follow-up: %s", (t) => {
    expect(isLikelyImageEdit(t)).toBe(true);
  });

  it.each([
    "這是什麼風格？", // question, not an edit command (trailing ？)
    "謝謝你",
    "請幫我把這整段活動流程的內容重新整理成一份完整詳細的表格謝謝你喔", // >40 chars
  ])("does not flag: %s", (t) => {
    expect(isLikelyImageEdit(t)).toBe(false);
  });
});

describe("hasCloudSaveCue", () => {
  it.each([
    "存到雲端",
    "備份到 google drive",
    "把圖片存起來",
    "上傳到雲端",
    "save images to drive",
    "upload to cloud",
  ])("detects cloud-save intent: %s", (t) => {
    expect(hasCloudSaveCue(t)).toBe(true);
  });

  it.each([
    "上傳圖片", // attaching 素材 — must NOT be read as a cloud save
    "傳一張圖給你",
    "儲存我的暱稱",
    "這張圖畫得真好",
  ])("does not misfire: %s", (t) => {
    expect(hasCloudSaveCue(t)).toBe(false);
  });
});

describe("extractSaveName", () => {
  it("pulls an explicit filename", () => {
    expect(extractSaveName("存到雲端，檔名：營火海報").fileName).toBe("營火海報");
  });

  it("pulls a team name", () => {
    expect(extractSaveName("第三小隊的圖存到雲端").teamName).toBe("第三小隊");
  });

  it("returns empty for a plain sentence", () => {
    expect(extractSaveName("這活動好好玩")).toEqual({});
  });
});

describe("resolveSaveBaseName", () => {
  it("prefers an explicit filename", () => {
    expect(resolveSaveBaseName("檔名：營火海報")).toBe("營火海報");
  });

  it("falls back to a team name", () => {
    expect(resolveSaveBaseName("第三小隊的圖存到雲端")).toBe("第三小隊");
  });

  it("falls back to a Taipei-local timestamp when nothing else fits", () => {
    // 2026-07-04 04:34 UTC → 12:34 Asia/Taipei (UTC+8).
    const now = new Date("2026-07-04T04:34:00Z");
    expect(resolveSaveBaseName(undefined, now)).toBe("20260704-1234");
    // A save request with no filename keyword and no patrol name → timestamp fallback.
    expect(resolveSaveBaseName("存到雲端", now)).toBe("20260704-1234");
  });
});
