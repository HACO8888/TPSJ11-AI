import { chatOnce } from "./aiClient";

// Cheap gate: only when a message mentions image-ish words do we pay for an
// LLM classification. Plain chat messages skip it entirely (zero added latency).
const IMAGE_CUE =
  /生圖|生成.*圖|產生.*圖|畫(一|個|張|出|幅)?|繪(製|圖)|來(一|張|個).*(圖|照)|給我.*(圖|照)|海報|插圖|貼圖|logo|icon|圖示|畫面|image|picture|photo|illustration|poster|draw|paint|render/i;

export function hasImageCue(text: string): boolean {
  return IMAGE_CUE.test(text);
}

const CLASSIFY_SYSTEM =
  "你是一個意圖判斷器。判斷使用者這則訊息是不是在「要求生成／繪製一張圖片」。" +
  '只輸出 JSON，不要任何其他文字，格式：{"image": true 或 false, "prompt": "若是，萃取出一段適合拿去生成圖片的描述（保留使用者想要的主體、風格、場景）；若否，給空字串"}。';

interface Parsed {
  image?: unknown;
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

/**
 * Decide whether `content` is an image-generation request. Returns the cleaned
 * prompt to feed the image model when it is. Falls back to chat on any doubt.
 */
export async function classifyImageIntent(
  content: string,
  signal?: AbortSignal,
): Promise<{ image: boolean; prompt: string }> {
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
      return { image: json.image, prompt };
    }
  } catch {
    /* network/parse failure → treat as chat */
  }
  return { image: false, prompt: content };
}
