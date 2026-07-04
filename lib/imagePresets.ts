import type { ImagePreset } from "./imagePrompt";

/**
 * Activity-specific image templates for the camp's most common materials. Each is a
 * clickable chip / example card that PREFILLS the composer with a ready-to-edit starter
 * prompt (the user fills the blanks and sends) — no backend change: the message routes
 * through the normal classifier, which produces the caption for the mixed turn.
 *
 * The starter carries the composition/style so non-prompt-savvy 童軍夥伴 get a
 * consistent, on-brand result. Aspect is expressed in Chinese inside the starter (直式/
 * 橫式/方形) so it works regardless of gateway size-param support.
 */
export interface StarterPreset extends ImagePreset {
  emoji: string;
  /** Ready-to-edit starter prompt prefilled into the composer. */
  starter: string;
}

export const IMAGE_PRESETS: StarterPreset[] = [
  {
    key: "poster",
    label: "海報",
    emoji: "🔥",
    aspect: "3:4",
    style: "直式海報、上方留白給大標題、溫暖童軍插畫風、鮮明色彩、構圖完整",
    starter:
      "幫我做一張直式海報，主題是：（請填，例如營火晚會），風格溫暖童軍插畫，圖上要放大標題文字「臺北市第 11 次大露營」。",
  },
  {
    key: "nametag",
    label: "名牌",
    emoji: "🏷️",
    aspect: "3:4",
    style: "直式名牌吊卡、簡潔留白放姓名與小隊、童軍識別色、可愛插圖點綴",
    starter:
      "幫我設計一張直式名牌，上面要放：姓名「」、小隊「第　小隊」，風格簡潔可愛、童軍風、留白好書寫。",
  },
  {
    key: "cert",
    label: "證書",
    emoji: "📜",
    aspect: "4:3",
    style: "橫式獎狀／證書、對稱典雅邊框、留白給文字、正式但不呆板",
    starter:
      "幫我做一張橫式證書／獎狀，標題「」、頒給「」、事由「」，典雅邊框、正式風格、留白給文字。",
  },
  {
    key: "cheer",
    label: "隊呼卡",
    emoji: "📣",
    aspect: "1:1",
    style: "方形隊呼卡、活潑動感、大字口號、鮮明配色",
    starter: "幫我做一張方形隊呼卡，隊名「」、口號「」，活潑動感、大字、鮮明配色。",
  },
  {
    key: "badge",
    label: "隊徽",
    emoji: "🛡️",
    aspect: "1:1",
    style: "圓形／盾形隊徽 logo、簡潔向量感、置中對稱、純色背景",
    starter:
      "幫我設計一個隊徽 logo，主題／意象是：（例如老鷹、營火），隊名「」，圓形或盾形、簡潔對稱、純色背景。",
  },
  {
    key: "map",
    label: "路線圖",
    emoji: "🗺️",
    aspect: "4:3",
    style: "橫式營地／路線示意圖、俯視插畫地圖、清楚標示地點與路徑、童趣風",
    starter:
      "幫我畫一張營地路線示意圖，要標示的地點有：（例如營本部、炊事區、營火場），俯視插畫地圖、清楚路徑、童趣風。",
  },
];
