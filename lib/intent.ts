import { type ChatMessage, chatOnce } from "./aiClient";

// Cheap gate: only when a message mentions image-ish words do we pay for an
// LLM classification. Plain chat messages skip it entirely (zero added latency).
const IMAGE_CUE =
  /生圖|生成.*[圖照]|產生.*[圖照]|(生成|製作|設計|繪製|產生|做|弄|幫我做)[^，。！？\n]{0,6}(海報|卡片|插畫|封面|貼紙|名牌|證書|橫幅|布條|頭像|桌布|一張|一幅|banner|logo)|畫(一|個|張|出|幅)?|繪(製|圖)|來(一|張|個).*(圖|照)|給我.*(圖|照)|張[圖照]|要.{0,5}[圖照]片?|想.{0,4}[圖照]片?|圖片|圖像|海報|插圖|插畫|貼圖|貼紙|頭像|桌布|封面|名牌|證書|橫幅|布條|圖示|畫面|logo|icon|image|picture|photo|illustration|poster|draw|paint|render/i;

export function hasImageCue(text: string): boolean {
  return IMAGE_CUE.test(text);
}

/**
 * A short image request with no actual subject ("幫我畫", "我要一張圖", "畫個東西").
 * Detected deterministically so a first-turn vague request can be answered with
 * an instant canned clarification (skipping the classifier).
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
  "你是一個意圖判斷器。根據提供的對話脈絡與使用者最新訊息，判斷使用者是不是想要一張圖片，以及能否得出可直接生成的具體描述。" +
  "只要使用者表達想要圖片就 image=true（即使沒主題，如「幫我畫」「我要一張圖」）。" +
  "若使用者要求把先前對話的內容做成圖／海報（例如「畫成圖」「用你的文字生成海報」「把上面做成圖」），" +
  "請從先前對話萃取主題，產生一段具體的圖片生成描述，並 ready=true。" +
  '只輸出 JSON，不要任何其他文字：{"image": true 或 false, "ready": true 或 false, "prompt": "具體的圖片生成描述；若無法得出則給空字串"}。' +
  "ready 判準：能得出明確主體或內容才為 true；若完全沒有可用內容（例如一開始就只說「幫我畫」），ready 為 false。";

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

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Decide whether the latest message wants an image and whether a concrete prompt
 * can be produced — using the recent conversation, so requests like "用你的文字
 * 生成一張海報" pull their subject from earlier turns. `ready === false` lets the
 * caller ask for clarification in chat instead of generating a bad image.
 */
export async function classifyImageIntent(
  content: string,
  history: HistoryTurn[],
  signal?: AbortSignal,
): Promise<ImageVerdict> {
  // Recent prior turns (exclude the just-inserted current user message).
  const prior = history.slice(0, -1).slice(-6);
  const priorText = prior
    .map((r) => `${r.role === "user" ? "使用者" : "助理"}：${r.content}`)
    .join("\n");
  const userMsg =
    (priorText ? `先前對話：\n${priorText}\n\n` : "") +
    `使用者最新訊息：${content}\n\n請依上述判斷並輸出 JSON。`;

  try {
    const messages: ChatMessage[] = [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: userMsg },
    ];
    const { content: raw } = await chatOnce(messages, signal);
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
