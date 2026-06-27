import "dotenv/config";

/**
 * One-off probe: does the configured AI gateway support image-to-image (passing a
 * reference image), and in which shape? Tries the two common OpenAI-compatible
 * forms and prints which one returns an image. The result decides how
 * `generateImage(prompt, { reference })` is wired (real edit vs. two-step text
 * fallback). Run manually: `pnpm tsx scripts/probe-image-edit.ts`
 */

const base = (process.env.AI_API_BASE_URL ?? "").replace(/\/$/, "");
const key = process.env.AI_API_KEY ?? "";
const model = process.env.AI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

if (!base || !key) {
  console.error("[probe] 缺少 AI_API_BASE_URL / AI_API_KEY（請確認 .env）");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${key}` };

function hasImage(j: unknown): boolean {
  const data = (j as { data?: { b64_json?: string; url?: string }[] })?.data;
  return Array.isArray(data) && !!(data[0]?.b64_json || data[0]?.url);
}

async function readBody(r: Response): Promise<string> {
  const t = await r.text().catch(() => "");
  return t.slice(0, 600);
}

async function genReference(): Promise<Buffer> {
  console.log("[probe] 1/3 先用 /images/generations 取得一張參考圖…");
  const r = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: "一隻坐著的黑貓，簡單插畫風，純色背景" }),
  });
  if (!r.ok) throw new Error(`generations 失敗 ${r.status}: ${await readBody(r)}`);
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new Error("generations 沒回 b64_json");
  return Buffer.from(b64, "base64");
}

async function tryEditsMultipart(ref: Buffer): Promise<boolean> {
  console.log("[probe] 2/3 嘗試 POST /images/edits（multipart: image + prompt）…");
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", "把這張圖改成可愛 Q 版卡通風格");
  fd.append("image", new Blob([new Uint8Array(ref)], { type: "image/jpeg" }), "ref.jpg");
  const r = await fetch(`${base}/images/edits`, { method: "POST", headers: auth, body: fd });
  const ok = r.ok;
  let parsedOk = false;
  if (ok) {
    const j = await r.json().catch(() => null);
    parsedOk = hasImage(j);
    console.log(`   → ${r.status}，回傳含圖片：${parsedOk}`);
  } else {
    console.log(`   → ${r.status}：${await readBody(r)}`);
  }
  return parsedOk;
}

async function tryGenerationsWithImage(ref: Buffer): Promise<boolean> {
  console.log("[probe] 3/3 嘗試 POST /images/generations（JSON 帶 image base64）…");
  const b64 = ref.toString("base64");
  const r = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: "把這張圖改成可愛 Q 版卡通風格",
      image: `data:image/jpeg;base64,${b64}`,
    }),
  });
  if (!r.ok) {
    console.log(`   → ${r.status}：${await readBody(r)}`);
    return false;
  }
  const j = await r.json().catch(() => null);
  const ok = hasImage(j);
  console.log(`   → ${r.status}，回傳含圖片：${ok}`);
  return ok;
}

async function main() {
  console.log(`[probe] gateway=${base}  model=${model}\n`);
  const ref = await genReference();
  console.log(`[probe] 參考圖 ${ref.length} bytes\n`);

  let edits = false;
  let genImg = false;
  try {
    edits = await tryEditsMultipart(ref);
  } catch (e) {
    console.log(`   → /images/edits 例外：${e instanceof Error ? e.message : e}`);
  }
  try {
    genImg = await tryGenerationsWithImage(ref);
  } catch (e) {
    console.log(`   → generations+image 例外：${e instanceof Error ? e.message : e}`);
  }

  console.log("\n──────── 結論 ────────");
  if (edits) console.log("✅ 支援 /images/edits（multipart）→ image-to-image 走此端點");
  else if (genImg) console.log("✅ 支援 /images/generations 帶 image → image-to-image 走此形態");
  else
    console.log(
      "❌ 兩種帶參考圖的形態都不支援 → image-to-image 改用『先 vision 描述、再純文字生圖』兩段式保底",
    );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[probe] 失敗:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
