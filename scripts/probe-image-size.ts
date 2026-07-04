import "dotenv/config";

/**
 * One-off probe: which generation controls does the gateway's /images/generations
 * accept — `size`, `aspect_ratio`, `n`, `negative_prompt`? For each we send a request
 * and report the HTTP status, whether an image came back, and the decoded pixel size,
 * so we can tell if the parameter actually changed the output (vs being ignored).
 * Run: `pnpm tsx scripts/probe-image-size.ts`
 */

const base = (process.env.AI_API_BASE_URL ?? "").replace(/\/$/, "");
const key = process.env.AI_API_KEY ?? "";
const model = process.env.AI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

if (!base || !key) {
  console.error("[size] 缺少 AI_API_BASE_URL / AI_API_KEY（請確認 .env）");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

/** Minimal PNG/JPEG dimension sniff (standalone — can't import server-only lib here). */
function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50)
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let off = 2;
    while (off + 9 < b.length) {
      if (b[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = b[off + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        off += 2;
        continue;
      }
      const len = b.readUInt16BE(off + 2);
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { height: b.readUInt16BE(off + 5), width: b.readUInt16BE(off + 7) };
      off += 2 + len;
    }
  }
  return null;
}

async function probe(label: string, body: Record<string, unknown>) {
  process.stdout.write(`\n[size] ${label}\n       body=${JSON.stringify(body)}\n`);
  try {
    const r = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ model, ...body }),
    });
    const text = await r.text();
    if (!r.ok) {
      console.log(`       → ${r.status}: ${text.slice(0, 200)}`);
      return;
    }
    let j: { data?: { b64_json?: string }[] };
    try {
      j = JSON.parse(text);
    } catch {
      console.log(`       → 200 但非 JSON：${text.slice(0, 120)}`);
      return;
    }
    const count = Array.isArray(j.data) ? j.data.length : 0;
    const first = j.data?.[0]?.b64_json;
    const dims = first ? imageSize(Buffer.from(first, "base64")) : null;
    console.log(
      `       → 200，圖片數=${count}，第一張尺寸=${dims ? `${dims.width}x${dims.height}` : "未知"}`,
    );
  } catch (e) {
    console.log(`       → 例外：${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log(`[size] gateway=${base}  model=${model}`);
  const prompt = "一隻坐著的柴犬，插畫風，純色背景";
  await probe("baseline（不帶尺寸參數）", { prompt });
  await probe("size=1024x1536（直式）", { prompt, size: "1024x1536" });
  await probe("aspect_ratio=3:4", { prompt, aspect_ratio: "3:4" });
  await probe("aspect_ratio=16:9（橫式）", { prompt, aspect_ratio: "16:9" });
  await probe("n=2（多張變體）", { prompt, n: 2 });
  await probe("negative_prompt", { prompt, negative_prompt: "文字, 浮水印, 多餘的手指, 低畫質" });
  console.log(
    "\n──────── 判讀 ────────\n" +
      "・若帶 size/aspect_ratio 後『第一張尺寸』隨之改變 → 閘道支援該參數，G1 走參數透傳。\n" +
      "・若尺寸不變或回 400 → 改走『prompt 內嵌比例 + sharp letterbox』。\n" +
      "・若 n=2 回『圖片數=2』→ 變體可用 n；否則需並行多次呼叫。\n" +
      "・negative_prompt 若 200 且正常出圖 → 可加預設 negative 尾綴。",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[size] 失敗:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
