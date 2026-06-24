import type { ContextRow } from "@/db/queries";
import type { ChatMessage } from "./aiClient";

export const SYSTEM_PROMPT =
  "你是「台北市第11次大露營（TSJ11）」的 AI 助理，協助童軍夥伴與工作人員。" +
  "請一律以繁體中文、友善且清楚地回覆，適度使用 Markdown 排版（標題、清單、程式碼區塊）。";

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
