import "dotenv/config";

/**
 * One-off probe: does the text model accept multimodal (image_url) input on
 * /chat/completions? This is what the 素材 "看圖問答" path relies on. Generates a
 * small image, then asks the model to describe it. Run: `pnpm tsx scripts/probe-vision.ts`
 */

const base = (process.env.AI_API_BASE_URL ?? "").replace(/\/$/, "");
const key = process.env.AI_API_KEY ?? "";
const textModel = process.env.AI_TEXT_MODEL ?? "gemini-flash-latest";
const imageModel = process.env.AI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

if (!base || !key) {
  console.error("[vision] 缺少 AI_API_BASE_URL / AI_API_KEY（請確認 .env）");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function genImage(): Promise<string> {
  const r = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ model: imageModel, prompt: "一顆紅色蘋果，白色背景，簡單照片" }),
  });
  if (!r.ok) throw new Error(`generations ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new Error("沒有 b64_json");
  return b64;
}

async function main() {
  console.log(`[vision] textModel=${textModel}\n[vision] 1/2 先生一張測試圖…`);
  const b64 = await genImage();
  console.log(`[vision] 2/2 用 image_url 問模型這是什麼…`);
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      model: textModel,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "這張圖片裡有什麼？用一句話回答。" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  const body = await r.text();
  if (!r.ok) {
    console.log(`\n❌ /chat/completions 不接受 image_url：${r.status}\n${body.slice(0, 500)}`);
    console.log("\n→ 結論：vision 看圖問答需改用其他形態（或關閉該功能）。");
    process.exit(0);
  }
  let answer = "";
  try {
    answer = JSON.parse(body)?.choices?.[0]?.message?.content ?? "";
  } catch {
    /* ignore */
  }
  console.log(`\n✅ 模型回覆：${answer || body.slice(0, 300)}`);
  const ok = /蘋果|apple|紅|水果/i.test(answer);
  console.log(
    ok
      ? "→ 結論：vision（image_url）可用，模型確實看到了圖。"
      : "→ 注意：有回覆但似乎沒看懂圖，請人工確認。",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[vision] 失敗:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
