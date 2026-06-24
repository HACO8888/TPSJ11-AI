import { chatOnce } from "./aiClient";

// Cheap gate: only when a message mentions image-ish words do we pay for an
// LLM classification. Plain chat messages skip it entirely (zero added latency).
const IMAGE_CUE =
  /生圖|生成.*圖|產生.*圖|畫(一|個|張|出|幅)?|繪(製|圖)|來(一|張|個).*(圖|照)|給我.*(圖|照)|海報|插圖|貼圖|logo|icon|圖示|畫面|image|picture|photo|illustration|poster|draw|paint|render/i;

export function hasImageCue(text: string): boolean {
  return IMAGE_CUE.test(text);
}

const CLASSIFY_SYSTEM =
  "你是一個意圖判斷器。判斷使用者這則訊息是不是在「要求生成／繪製一張圖片」，以及描述是否已具體到可以直接生成。" +
  "只輸出 JSON，不要任何其他文字，格式：" +
  '{"image": true 或 false, "ready": true 或 false, "prompt": "若 image 為 true 且具體，萃取一段可直接生成圖片的描述（保留主體、風格、場景）；否則給空字串"}。' +
  "ready 判準：描述需有明確的主體或內容才算具體；像「幫我畫」「我要一張圖」「畫個東西」這類沒有主題的，ready 為 false。";

interface Parsed {
  image?: unknown;
  ready?: unknown;
  prompt?: unknown;
}

function extractJson(s: string): Parsed | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Parsed;
  } catch {
    return null;
  }
}

export interface ImageVerdict {
  image: boolean;
  ready: boolean;
  prompt: string;
}

/**
 * Decide whether `content` is an image-generation request and whether its
 * description is concrete enough to generate. `ready === false` lets the caller
 * skip the slow image round-trip and ask for clarification in chat instead.
 * Falls back to chat on any doubt.
 */
export async function classifyImageIntent(
  content: string,
  signal?: AbortSignal,
): Promise<ImageVerdict> {
  try {
    const { content: raw } = await chatOnce(
      [
        { role: "system", content: CLASSIFY_SYSTEM },
        { role: "user", content },
      ],
      signal,
    );
    const json = extractJson(raw);
    if (json && typeof json.image === "boolean") {
      const prompt =
        typeof json.prompt === "string" && json.prompt.trim() ? json.prompt.trim() : content;
      return { image: json.image, ready: json.ready === true, prompt };
    }
  } catch {
    /* network/parse failure → treat as chat */
  }
  return { image: false, ready: false, prompt: content };
}
