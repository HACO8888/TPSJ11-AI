import "dotenv/config";

/**
 * One-off probe for Strategy A (single-call native text+image): does calling
 * /chat/completions with the IMAGE model return an image in the response, and in what
 * shape? Gemini image models can natively interleave text + image, but this gateway's
 * OpenAI-compatible surface may or may not expose it. We dump the response structure so
 * we can decide whether/how to write the parser. Run: `pnpm tsx scripts/probe-interleaved.ts`
 */

const base = (process.env.AI_API_BASE_URL ?? "").replace(/\/$/, "");
const key = process.env.AI_API_KEY ?? "";
const imageModel = process.env.AI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

if (!base || !key) {
  console.error("[interleaved] 缺少 AI_API_BASE_URL / AI_API_KEY（請確認 .env）");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

/** Summarise where an image might be hiding without dumping megabytes of base64. */
function describe(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (typeof value === "string") {
    const isDataUri = /^data:image\//.test(value);
    const hasMdImg = /!\[[^\]]*\]\(data:image\//.test(value);
    const tag = isDataUri
      ? "<data-uri image>"
      : hasMdImg
        ? "<string w/ markdown data-uri image>"
        : "string";
    return `${tag}(${value.length} chars)${value.length < 120 && !isDataUri && !hasMdImg ? ` = ${JSON.stringify(value)}` : ""}`;
  }
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => `${pad}  ${describe(v, depth + 1)}`).join(",\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${pad}  ${k}: ${describe(v, depth + 1)}`,
    );
    return `{\n${entries.join(",\n")}\n${pad}}`;
  }
  return String(value);
}

async function run(stream: boolean) {
  console.log(`\n[interleaved] === stream=${stream} ===`);
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      model: imageModel,
      stream,
      messages: [
        {
          role: "user",
          content: "畫一張童軍在營火旁搭帳篷的溫暖插畫，並用一句話說明這張圖。",
        },
      ],
    }),
  });
  if (!r.ok) {
    console.log(`  → ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (!stream) {
    const j = await r.json();
    const msg = j?.choices?.[0]?.message;
    console.log("  message 結構：");
    console.log(describe(msg, 1));
    return;
  }
  // stream: dump the first few chunks' shapes.
  const reader = r.body?.getReader();
  if (!reader) {
    console.log("  → 無 body");
    return;
  }
  const dec = new TextDecoder();
  let buf = "";
  let shown = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const recs = buf.split("\n\n");
    buf = recs.pop() ?? "";
    for (const rec of recs) {
      const line = rec.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        if (shown < 6) {
          console.log(`  chunk#${shown} delta：${describe(j?.choices?.[0]?.delta, 1)}`);
          shown++;
        }
      } catch {
        /* skip */
      }
    }
  }
}

async function main() {
  console.log(`[interleaved] gateway=${base}  imageModel=${imageModel}`);
  await run(false);
  await run(true);
  console.log(
    "\n──────── 判讀 ────────\n" +
      "・看 message / delta 裡圖片落在哪：images[]、content 陣列的 image_url part、或字串內嵌 data:image markdown。\n" +
      "・據此在 lib/aiClient.ts 寫 imageChatStream 的 parser，並以 AI_NATIVE_INTERLEAVE 旗標啟用（預設 off，失敗回落 Strategy B）。",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[interleaved] 失敗:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
