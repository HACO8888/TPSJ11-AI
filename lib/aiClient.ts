import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const base = () => env.AI_API_BASE_URL.replace(/\/$/, "");
const authHeaders = () => ({
  Authorization: `Bearer ${env.AI_API_KEY}`,
  "Content-Type": "application/json",
});

/** Non-streaming chat — the fallback path when streaming is unavailable. */
export async function chatOnce(messages: ChatMessage[], signal?: AbortSignal) {
  const r = await fetch(`${base()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: JSON.stringify({ model: env.AI_TEXT_MODEL, messages, stream: false }),
  }).catch(networkError);
  if (!r.ok) throw await upstreamError(r);
  const j = await r.json();
  return {
    content: (j?.choices?.[0]?.message?.content as string) ?? "",
    usage: (j?.usage as Record<string, unknown> | null) ?? null,
  };
}

/** Streaming chat — returns the raw upstream Response so the relay can read its body. */
export async function chatStream(messages: ChatMessage[], signal?: AbortSignal): Promise<Response> {
  const r = await fetch(`${base()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: JSON.stringify({ model: env.AI_TEXT_MODEL, messages, stream: true }),
  }).catch(networkError);
  if (!r.ok || !r.body) throw await upstreamError(r);
  return r;
}

export interface GeneratedImage {
  buf: Buffer;
  mime: string;
  width: number | null;
  height: number | null;
}

/** Generate an image. Upstream returns base64 (~8MB JPEG, ~23s). */
export async function generateImage(prompt: string, signal?: AbortSignal): Promise<GeneratedImage> {
  const r = await fetch(`${base()}/images/generations`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: JSON.stringify({ model: env.AI_IMAGE_MODEL, prompt }),
  }).catch(networkError);
  if (!r.ok) throw await upstreamError(r);
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new HttpError(502, "UPSTREAM_BAD", "圖片產生失敗");
  const buf = Buffer.from(b64, "base64");
  const mime = sniffMime(buf);
  const dims = imageSize(buf);
  return { buf, mime, width: dims?.width ?? null, height: dims?.height ?? null };
}

/* --------------------------------- helpers ------------------------------------- */

function sniffMime(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49) return "image/webp";
  return "application/octet-stream";
}

function imageSize(b: Buffer): { width: number; height: number } | null {
  // PNG: width/height in the IHDR chunk.
  if (b[0] === 0x89 && b[1] === 0x50) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: scan for an SOF marker.
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
      if (isSOF) {
        return { height: b.readUInt16BE(off + 5), width: b.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }
  return null;
}

function networkError(): never {
  throw new HttpError(504, "UPSTREAM_TIMEOUT", "AI 服務連線逾時或中斷");
}

async function upstreamError(r: Response): Promise<HttpError> {
  const body = await r.text().catch(() => "");
  let msg = body;
  try {
    msg = JSON.parse(body)?.error?.message ?? body;
  } catch {
    /* keep raw */
  }
  if (r.status === 401) return new HttpError(502, "UPSTREAM_AUTH", "AI 服務驗證失敗");
  if (r.status === 429) return new HttpError(502, "UPSTREAM_RATE", "AI 服務忙碌中，請稍後再試");
  return new HttpError(502, "UPSTREAM", "AI 服務錯誤", String(msg).slice(0, 300));
}
