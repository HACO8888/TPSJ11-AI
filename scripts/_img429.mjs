import "dotenv/config";

const base = (process.env.AI_API_BASE_URL || "").replace(/\/$/, "");
const model = process.env.AI_IMAGE_MODEL;
console.log("我方呼叫的閘道:", base);
console.log("圖片模型:", model);
try {
  const r = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt: "a tiny red dot" }),
  });
  const t = await r.text();
  console.log(`\n閘道回應 HTTP ${r.status}`);
  console.log("body:", t.slice(0, 700));
} catch (e) {
  console.log("連線失敗:", e.message);
}
