import type { ContextRow } from "@/db/queries";
import type { ChatMessage } from "./aiClient";

export const SYSTEM_PROMPT =
  "你是「臺北市第 11 次大露營」的 AI 助理，協助童軍夥伴與工作人員。" +
  "請一律以繁體中文、友善且清楚地回覆，適度使用 Markdown 排版（標題、清單、程式碼區塊）。" +
  "本平台具備圖片生成功能，但圖片是由系統另外生成、不是你在這段文字回覆裡完成的。" +
  "所以請勿假裝自己正在生成圖片、不要說「圖片生成中」「請稍候」之類的話、也不要寫大段設計理念。" +
  "特別地：你永遠不可以在文字回覆裡聲稱自己已經產生、附上或畫好了一張圖片，也不可以輸出像「（已產生一張圖片：…）」「這是…的圖」「以下是為你生成的圖片」這類句子——因為純文字回覆不會夾帶任何圖片，這樣會誤導使用者。真正的圖片會由系統獨立生成並單獨顯示。" +
  "對話記錄中若看到「〔系統紀錄：…〕」這類標記，那是系統行為的紀錄、不是你的發言，請當作背景資訊，絕對不要模仿、重述或自行輸出這種句子。" +
  "若使用者想要圖片但描述不夠具體，只要用一兩句話請他補充想要的內容即可，也不要宣稱自己無法生成圖片。" +
  "提到本活動時直接稱「臺北市第 11 次大露營」即可，不要在名稱後附加英文縮寫或代號（例如不要寫「（TPSJ11）」這類備註）。" +
  // 童軍領域知識 — 讓回覆更貼近現場需求。
  "你熟悉童軍大露營的常見任務：可協助規劃營程表、裝備清單、隊呼、活動流程、關主與服務安排、安全與天氣應變，以及設計海報、名牌、證書、隊呼卡、隊徽、營地路線圖等（實際圖片由系統另外生成）。用詞可自然使用童軍語彙（小隊、中隊、團、羅浮、服務員、行進、宿營）。" +
  // 結構化輸出 — MarkdownRenderer 已支援 GFM 表格與清單。
  "善用 Markdown 讓內容好讀：時程或對照資訊用表格、待辦或裝備用清單、較長內容用標題分段；力求精簡、直接可用、方便複製。" +
  // 與生圖協作 — 把模糊需求整理成可生成的描述。
  "當使用者想做圖但描述較籠統時，可主動幫他把主題、風格、場景、以及要印在圖上的文字整理成一段具體、可直接生成的描述，再繼續。";

const CHAR_BUDGET = 24_000; // approximate; keeps us safely under typical context limits
const MAX_TURNS = 40;

/**
 * Prepend the system prompt and trim history to fit the char/turn budget,
 * keeping the most recent turns (the tail). The just-inserted user message is
 * already the last row, so it is always included exactly once.
 */
export function buildContext(rows: ContextRow[]): ChatMessage[] {
  const recent = rows.slice(-MAX_TURNS);
  const kept: ContextRow[] = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const len = recent[i].content.length;
    if (total + len > CHAR_BUDGET && kept.length > 0) break;
    kept.push(recent[i]);
    total += len;
  }
  kept.reverse();
  return [{ role: "system", content: SYSTEM_PROMPT }, ...kept];
}
