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

// A flat white/plain background is wanted (logo / emblem / nametag / certificate /
// sticker / explicit "white/plain/solid background"). Deliberately conservative:
// scenic illustrations (poster / map / a white animal on a colourful scene) must NOT
// match, since post-processing would blow out their real highlights. Note bare 白/白色
// alone don't match — only 白底 / 白色背景 / 純白 etc.
const FLAT_WHITE =
  /純白|純色背景|白底|白色背景|乾淨背景|透明背景|logo|emblem|隊徽|徽章|名牌|識別證|證書|獎狀|貼紙|sticker|nametag|name\s?tag|certificate|badge|plain\s+(?:white\s+|solid\s+)?background|solid\s+(?:white\s+)?background|flat\s+background|white\s+back(?:ground|drop)|clean\s+background|transparent\s+background/i;

/**
 * True when the prompt asks for a flat/plain white-background graphic — the case where
 * the image model tends to render a *textured* off-white (which JPEG then turns into
 * visible noise), so we both harden the prompt and post-process the background to pure
 * white. See lib/imageClean.ts.
 */
export function wantsFlatWhite(text: string): boolean {
  return FLAT_WHITE.test(text);
}

// A printable coloring page / line-art is wanted (著色頁/著色本/線稿/coloring page …).
// Distinct from FLAT_WHITE: here the WHOLE image should be pure black outlines on white
// with no colour and no grey — the model instead paints a photographed off-white with a
// grey haze, so we both harden the prompt and flatten the greys post-hoc. Deliberately
// does not match "彩色/coloured" (那是要上色的成品，不是線稿).
const LINE_ART =
  /著色|塗色|填色|線稿|描邊線|coloring|colouring|line[\s-]?art|lineart|colou?r\s+in\b|black[\s-]and[\s-]white\s+outline/i;

/**
 * True when the prompt asks for a black-and-white coloring page / line-art drawing —
 * the case where the image model tends to add a grey haze/vignette over what should be
 * a pure black-on-white line drawing. We harden the prompt and flatten the greys to
 * white afterwards. See flattenLineArt in lib/imageClean.ts.
 */
export function wantsLineArt(text: string): boolean {
  return LINE_ART.test(text);
}

const FLAT_WHITE_DIRECTIVE =
  "背景必須是單一純白平面 #FFFFFF，像去背後乾淨地放在純白上，完全沒有任何紋理、漸層、陰影、雜點、污漬、做舊、復古、磨損、斑駁、網格、紙張或布料質感，乾淨俐落的向量插畫風格";

const LINE_ART_DIRECTIVE =
  "純黑色線條的黑白著色線稿，乾淨俐落的向量描邊，純白 #FFFFFF 背景，畫面只有黑色外框線，完全沒有任何灰階、灰色、陰影、上色、填色、網底、漸層、紋理、雜點或做舊質感，線條清晰封閉、粗細均勻，適合列印著色";

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
  // Harden the prompt at the source when a flat white background is wanted.
  const flat = wantsFlatWhite(raw) || (preset ? wantsFlatWhite(preset.style) : false);
  // …or a black-and-white coloring page (steer the model to clean line-art up front).
  const lineArt = wantsLineArt(raw) || (preset ? wantsLineArt(preset.style) : false);
  const parts = [
    raw,
    preset?.style ?? "",
    preset?.aspect ? `畫面比例約 ${preset.aspect}` : "",
    flat ? FLAT_WHITE_DIRECTIVE : "",
    lineArt ? LINE_ART_DIRECTIVE : "",
    QUALITY_TAIL,
  ]
    .map(trimTail)
    .filter(Boolean);
  return parts.join("。");
}
