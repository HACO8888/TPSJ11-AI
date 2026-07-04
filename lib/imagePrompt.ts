/**
 * Image-prompt shaping. Pure and dependency-free so it's unit-tested and shared by the
 * generation branch and the (Phase 5) template presets.
 *
 * Design rules:
 *  • Additive & intent-preserving — the user/classifier prompt always leads; we only
 *    append a preset's style skeleton and a light quality tail.
 *  • Never translate. Chinese that should be printed ON the image (poster / nametag /
 *    certificate text like 「臺北市第 11 次大露營」「第 3 小隊」) is passed through
 *    verbatim so the image model renders it correctly; only generic quality words are
 *    added.
 */

export interface ImagePreset {
  /** stable id, e.g. "poster". */
  key: string;
  /** UI label, e.g. "海報". */
  label: string;
  /** aspect-ratio hint, e.g. "3:4" (portrait). Also used for the gateway size param. */
  aspect?: string;
  /** composition / style skeleton appended to the user's subject. */
  style: string;
}

const QUALITY_TAIL = "高解析度、細節清晰、構圖完整、色彩協調、專業質感";

function trimTail(s: string): string {
  return s.replace(/[。，、\s]+$/u, "").trim();
}

/**
 * Compose the final generation prompt from the raw subject (+ optional preset).
 * Returns the raw prompt unchanged in meaning, followed by the preset style, an aspect
 * hint, and a quality tail — segments joined with "。" and de-duplicated of trailing
 * punctuation so we never emit "。。".
 */
export function enhanceImagePrompt(raw: string, preset?: ImagePreset): string {
  const parts = [
    raw,
    preset?.style ?? "",
    preset?.aspect ? `畫面比例約 ${preset.aspect}` : "",
    QUALITY_TAIL,
  ]
    .map(trimTail)
    .filter(Boolean);
  return parts.join("。");
}
