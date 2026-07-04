/**
 * Pure, dependency-free intent heuristics: deterministic regex gates that decide
 * whether a message is *worth* an LLM classification, plus cloud-save keyword
 * detection and filename extraction. Split out of `lib/intent.ts` (which keeps the
 * network-bound `classifyImageIntent`) so these can be unit-tested without pulling in
 * `aiClient` / `server-only` / `env`. `lib/intent.ts` re-exports everything here, so
 * existing `@/lib/intent` imports keep working unchanged.
 */

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

// Short, cue-less follow-ups that look like an *edit* of a previous image
// ("卡通版的", "我要Q版的", "換成藍色背景", "伸出貓爪"). Gates whether such a
// message (after a recent image) is worth a classifier call — keeping plain
// chat ("謝謝", "這活動在哪辦") on the instant path. Missing one only degrades to
// honest chat, never to a faked image (the system prompt forbids that).
const EDIT_CUE =
  /版|風格|改成|改為|換成|換個|換掉|配色|顏色|背景|加上|加個|去掉|拿掉|移除|變成|弄成|做成|更|大一點|小一點|放大|縮小|動作|表情|姿勢|戴|穿|拿著|伸出|抱著|卡通|寫實|手繪|油畫|水彩|素描|夜晚|白天|微笑|生氣/i;

export function isLikelyImageEdit(text: string): boolean {
  if (text.length > 40) return false;
  if (/[嗎?？]\s*$/.test(text)) return false; // a question, not an edit command
  return EDIT_CUE.test(text);
}

/* --------------------------------- cloud save ---------------------------------- */

// Deterministic keyword gate for "push this session's generated images to the cloud".
// Broad on purpose — this app's only "save" IS the cloud save, so a save verb next to
// a file/image object (存檔案、存圖片、存起來) or a cloud target (存到雲端、上傳雲端)
// all count. 上傳/傳 only trigger with a cloud target, so "上傳圖片" (= attach 素材)
// is NOT misread as a cloud save.
const CLOUD_TARGET = "雲端硬碟|雲端|google\\s*drive|g\\s*drive|gdrive|雲|drive";
const CLOUD_SAVE_CUE = new RegExp(
  `(?:儲存|存|保存|備份)\\s*(?:到|至|去|進|上|成)?\\s*(?:${CLOUD_TARGET}|檔案|檔|圖片|圖|相片|照片|這張|起來|下來)` +
    `|(?:上傳|傳|同步)\\s*(?:到|至)?\\s*(?:${CLOUD_TARGET})` +
    `|雲端\\s*(?:儲存|備份|上傳|保存)` +
    `|save\\s+(?:this|it|them|file|images?|photos?|the\\s+images?|to\\s+(?:the\\s+)?(?:cloud|google\\s*drive|drive))` +
    `|upload\\s+(?:to\\s+)?(?:the\\s+)?(?:cloud|google\\s*drive|drive)`,
  "i",
);

/** True when the message asks to save the session's images to the cloud. */
export function hasCloudSaveCue(text: string): boolean {
  return CLOUD_SAVE_CUE.test(text);
}

export interface SaveName {
  /** An explicit filename the user gave ("檔名：營火海報"). */
  fileName?: string;
  /** A patrol/team name mentioned ("第三小隊", "獵鷹小隊"). */
  teamName?: string;
}

// Strip characters that are illegal (or awkward) in a Drive filename.
function sanitizeName(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 40);
}

/**
 * Pull a filename and/or team name out of the message so a cloud save can honour
 * "存到雲端，檔名叫營火海報" or "第三小隊的圖存到雲端".
 */
export function extractSaveName(text: string): SaveName {
  const out: SaveName = {};

  const fm = text.match(
    /(?:檔名|檔案名稱|檔案名|命名為|命名成|存成|存為|另存為|叫做|叫作|名為|filename|file\s*name)\s*[:：叫為]?\s*["「『]?([^\s"」』，。、!！?？\n]{1,40})/i,
  );
  if (fm?.[1]) out.fileName = sanitizeName(fm[1]);

  // 「第N小隊/小組」 or 「XX小隊/小組」 (bounded so we don't swallow a whole sentence).
  const tm = text.match(
    /第\s*[0-9零一二三四五六七八九十百]{1,3}\s*(?:小隊|小組|中隊|分隊)|[一-鿿A-Za-z0-9]{1,6}(?:小隊|小組)/,
  );
  if (tm?.[0]) out.teamName = sanitizeName(tm[0]);

  return out;
}

// Taipei-local "YYYYMMDD-HHmm" — the fallback base name when nothing else fits.
// `now` is injectable so the timestamp branch is deterministically testable.
function timestampName(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}${g("month")}${g("day")}-${g("hour")}${g("minute")}`;
}

/**
 * The base name for cloud-saved files: an explicit filename wins, then a team
 * name, else a timestamp. Files get a `_1`.._N suffix by the caller.
 */
export function resolveSaveBaseName(content?: string, now: Date = new Date()): string {
  if (content) {
    const { fileName, teamName } = extractSaveName(content);
    if (fileName) return fileName;
    if (teamName) return teamName;
  }
  return timestampName(now);
}
