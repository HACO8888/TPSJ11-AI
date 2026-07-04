import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { classifyUpstreamError } from "./upstream-errors";

/** OpenAI-style multimodal content: a plain string, or text + image_url parts (vision). */
export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = { type: "image_url"; image_url: { url: string } };
export type ChatContent = string | Array<ChatTextPart | ChatImagePart>;
export type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatContent };

const base = () => env.AI_API_BASE_URL.replace(/\/$/, "");
const bearer = () => ({ Authorization: `Bearer ${env.AI_API_KEY}` });
const authHeaders = () => ({ ...bearer(), "Content-Type": "application/json" });

/** Per-call overrides: a specific model and/or sampling temperature. */
export interface ChatOpts {
  model?: string;
  temperature?: number;
}

function chatBody(messages: ChatMessage[], stream: boolean, opts?: ChatOpts) {
  return JSON.stringify({
    model: opts?.model || env.AI_TEXT_MODEL,
    messages,
    stream,
    ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
  });
}

/** Non-streaming chat — the fallback path when streaming is unavailable. */
export async function chatOnce(messages: ChatMessage[], signal?: AbortSignal, opts?: ChatOpts) {
  const r = await fetch(`${base()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: chatBody(messages, false, opts),
  }).catch(networkError);
  if (!r.ok) throw await upstreamError(r);
  const j = await r.json();
  return {
    content: (j?.choices?.[0]?.message?.content as string) ?? "",
    usage: (j?.usage as Record<string, unknown> | null) ?? null,
  };
}

/** Streaming chat — returns the raw upstream Response so the relay can read its body. */
export async function chatStream(
  messages: ChatMessage[],
  signal?: AbortSignal,
  opts?: ChatOpts,
): Promise<Response> {
  const r = await fetch(`${base()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: chatBody(messages, true, opts),
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
  if (!b64) throw new HttpError(502, "IMAGE_NO_OUTPUT", "這次沒有生成出圖片");
  const buf = Buffer.from(b64, "base64");
  const mime = sniffMime(buf);
  const dims = imageSize(buf);
  return { buf, mime, width: dims?.width ?? null, height: dims?.height ?? null };
}

export interface ImageReference {
  bytes: Buffer;
  mime: string;
}

/**
 * Image-to-image edit: transform a reference image per the prompt. Uses the
 * gateway's multipart `/images/edits` (confirmed working via scripts/probe-image-edit.ts).
 * Used for "把這張照片做成卡通版" and for follow-up edits of a generated image.
 */
export async function generateImageEdit(
  prompt: string,
  reference: ImageReference,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const ext =
    reference.mime === "image/png"
      ? "png"
      : reference.mime === "image/webp"
        ? "webp"
        : reference.mime === "image/gif"
          ? "gif"
          : "jpg";
  const fd = new FormData();
  fd.append("model", env.AI_IMAGE_MODEL);
  fd.append("prompt", prompt);
  fd.append(
    "image",
    new Blob([new Uint8Array(reference.bytes)], { type: reference.mime }),
    `reference.${ext}`,
  );
  // No Content-Type header — fetch sets the multipart boundary itself.
  const r = await fetch(`${base()}/images/edits`, {
    method: "POST",
    headers: bearer(),
    signal,
    body: fd,
  }).catch(networkError);
  if (!r.ok) throw await upstreamError(r);
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new HttpError(502, "IMAGE_NO_OUTPUT", "這次沒有生成出圖片");
  const buf = Buffer.from(b64, "base64");
  const mime = sniffMime(buf);
  const dims = imageSize(buf);
  return { buf, mime, width: dims?.width ?? null, height: dims?.height ?? null };
}

/* --------------------- Strategy A: native single-call text+image ---------------- */

/**
 * Build a GeneratedImage from raw base64 (sniff the mime/dims; fall back to a hint).
 */
function b64ToImage(b64: string, mimeHint?: string): GeneratedImage {
  const buf = Buffer.from(b64, "base64");
  const sniffed = sniffMime(buf);
  const mime = sniffed !== "application/octet-stream" ? sniffed : (mimeHint ?? "image/png");
  const dims = imageSize(buf);
  return { buf, mime, width: dims?.width ?? null, height: dims?.height ?? null };
}

function dataUriToImage(uri: string): GeneratedImage | null {
  const m = uri.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  return m ? b64ToImage(m[2], m[1]) : null;
}

// biome-ignore lint/suspicious/noExplicitAny: probing an unknown gateway response shape
function extractImageFromMessage(msg: any): GeneratedImage | null {
  if (!msg) return null;
  // 1. message.images[] — [{image_url:{url:"data:…"}}] | [{b64_json}] | ["data:…"]
  if (Array.isArray(msg.images)) {
    for (const im of msg.images) {
      if (typeof im === "string") {
        const r = dataUriToImage(im);
        if (r) return r;
      }
      if (im?.image_url?.url) {
        const r = dataUriToImage(im.image_url.url);
        if (r) return r;
      }
      if (im?.b64_json) return b64ToImage(im.b64_json);
    }
  }
  // 2. content as an array of parts (OpenAI image_url / Gemini inline_data)
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === "image_url" && part.image_url?.url) {
        const r = dataUriToImage(part.image_url.url);
        if (r) return r;
      }
      if (part?.inline_data?.data)
        return b64ToImage(part.inline_data.data, part.inline_data.mime_type);
    }
  }
  // 3. a data: image embedded in a content string (e.g. markdown)
  if (typeof msg.content === "string") {
    const m = msg.content.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i);
    if (m) return dataUriToImage(m[0]);
  }
  return null;
}

// biome-ignore lint/suspicious/noExplicitAny: probing an unknown gateway response shape
function extractText(content: any): string {
  if (typeof content === "string") {
    // strip any inline data-uri markdown image so the caption is clean text
    return content.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/gi, "").trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
  }
  return "";
}

/**
 * Strategy A (experimental, flag-gated by the caller): ask the IMAGE model on
 * /chat/completions for a single native text+image reply. Non-streaming so the caller
 * only commits once it knows whether an image came back (avoids double-text if it must
 * fall back). Returns the text and the image (null when the response carried no image →
 * the caller falls back to the classic two-step flow).
 */
export async function imageChatOnce(
  prompt: string,
  signal?: AbortSignal,
): Promise<{ text: string; image: GeneratedImage | null }> {
  const r = await fetch(`${base()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: JSON.stringify({
      model: env.AI_IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  }).catch(networkError);
  if (!r.ok) throw await upstreamError(r);
  const j = await r.json();
  const msg = j?.choices?.[0]?.message;
  return { text: extractText(msg?.content), image: extractImageFromMessage(msg) };
}

/* --------------------------------- helpers ------------------------------------- */

export function sniffMime(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  // GIF: "GIF8" (GIF87a / GIF89a).
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  // WebP: "RIFF"…"WEBP" — must check the WEBP tag at offset 8, else any RIFF
  // container (WAV/AVI) would be misread as an image.
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

export function imageSize(b: Buffer): { width: number; height: number } | null {
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

function networkError(e: unknown): never {
  if (e instanceof Error && e.name === "AbortError") {
    throw new HttpError(499, "ABORTED", "已取消");
  }
  throw new HttpError(504, "UPSTREAM_TIMEOUT", "AI 服務連線逾時或中斷", {
    cause: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
  });
}

async function upstreamError(r: Response): Promise<HttpError> {
  const body = await r.text().catch(() => "");
  const details = {
    upstreamStatus: r.status,
    upstreamStatusText: r.statusText,
    url: r.url,
    body: body.slice(0, 4000),
  };
  // Classification (auth / rate / capacity / no-image / generic) is a pure, unit-tested
  // decision in lib/upstream-errors.ts; here we only attach the diagnostic details.
  const { code, message } = classifyUpstreamError(r.status, body);
  return new HttpError(502, code, message, details);
}
