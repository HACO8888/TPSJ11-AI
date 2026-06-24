import { chatOnce } from "./aiClient";

// Cheap gate: only when a message mentions image-ish words do we pay for an
// LLM classification. Plain chat messages skip it entirely (zero added latency).
const IMAGE_CUE =
  /生圖|生成.*圖|產生.*圖|畫(一|個|張|出|幅)?|繪(製|圖)|來(一|張|個).*(圖|照)|給我.*(圖|照)|張[圖照]|要.{0,5}[圖照]片?|想.{0,4}[圖照]片?|圖片|圖像|海報|插圖|貼圖|logo|icon|圖示|畫面|image|picture|photo|illustration|poster|draw|paint|render/i;

export function hasImageCue(text: string): boolean {
  return IMAGE_CUE.test(text);
}

/**
 * A short image request with no actual subject ("幫我畫", "我要一張圖", "畫個東西").
 * Detected deterministically so we can skip the classifier entirely and answer
 * with an instant canned clarification.
 */
export function isBareImageRequest(text: string): boolean {
  if (text.length > 14) return false;
  const stripped = text
    .replace(/生成|生圖|繪製|畫面|畫圖|圖片|圖像|圖示/gi, "")
    .replace(/image|picture|photo|draw|paint|create|generate/gi, "")
    .replace(/[幫我請可以想要一張個的能不麻煩你妳來給做嗎吧喔呢啊把那這就幫畫繪圖照片東西看]/g, "")
    .replace(/[\s，。、！？!?~…．.　]/g, "")
    .trim();
  return stripped.length === 0;
}

const CLASSIFY_SYSTEM =
  "你是一個意圖判斷器。判斷使用者這則訊息是不是想要一張圖片（想生成／繪製圖片），以及描述是否已具體到可以直接生成。" +
  "只要使用者表達想要圖片，image 就為 true，即使沒有提供具體內容（例如「幫我畫」「我要一張圖」「畫個東西」「來張圖」都算 image=true）。" +
  "只輸出 JSON，不要任何其他文字，格式：" +
  '{"image": true 或 false, "ready": true 或 false, "prompt": "若 image 為 true 且具體，萃取一段可直接生成圖片的描述（保留主體、風格、場景）；否則給空字串"}。' +
  "ready 判準：描述需有明確的主體或內容才為 true；上述那些沒有主題的例子 ready 為 false。";

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
