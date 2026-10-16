import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { classifyUpstreamError, isRetryableUpstream } from "./upstream-errors";

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

/**
 * Generate an image. The image model answers on /chat/completions with the picture in
 * `message.images` (the gateway does not serve it on /images/generations). Transient
 * failures ("no healthy provider", a brief 5xx, a reply with no image) are auto-retried
 * with backoff (see withImageRetry). A first-try success pays zero extra latency.
 */
export async function generateImage(prompt: string, signal?: AbortSignal): Promise<GeneratedImage> {
  return withImageRetry(() => chatImageOnce(prompt, signal), signal);
}

export interface ImageReference {
  bytes: Buffer;
  mime: string;
}

/**
 * Image-to-image edit: transform a reference image per the prompt. The reference goes
 * in as an `image_url` data URI on /chat/completions, the same call as generateImage.
 * Used for "把這張照片做成卡通版" and for follow-up edits of a generated image.
 * Transient upstream failures are auto-retried (see withImageRetry).
 */
export async function generateImageEdit(
  prompt: string,
  reference: ImageReference,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const content: ChatContent = [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: { url: `data:${reference.mime};base64,${reference.bytes.toString("base64")}` },
    },
  ];
  return withImageRetry(() => chatImageOnce(content, signal), signal);
}

/** One image-model call on /chat/completions that must come back with a picture. */
async function chatImageOnce(content: ChatContent, signal?: AbortSignal): Promise<GeneratedImage> {
  const r = await fetch(`${base()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: JSON.stringify({
      model: env.AI_IMAGE_MODEL,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  }).catch(networkError);
  if (!r.ok) throw await upstreamError(r);
  const j = await r.json();
  const image = extractImageFromMessage(j?.choices?.[0]?.message);
  if (!image) throw new HttpError(502, "IMAGE_NO_OUTPUT", "這次沒有生成出圖片");
  return image;
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

/* ------------------------------- retry policy ---------------------------------- */

// Bounded retry for TRANSIENT image-generation failures. The gateway's only image
// model intermittently has "no healthy provider" or a brief 5xx / no-image reply; a
// quick backoff+retry usually clears it. Non-transient failures (real quota, auth, a
// rejected prompt, an abort) are thrown immediately — see isRetryableUpstream.
const IMAGE_RETRY = { maxRetries: 2, baseMs: 800, factorMs: 2, capMs: 3000, jitterMs: 400 };

function upstreamStatusOf(e: HttpError): number | undefined {
  return e.details && typeof e.details === "object"
    ? (e.details as { upstreamStatus?: number }).upstreamStatus
    : undefined;
}

function backoffMs(attempt: number): number {
  const raw = Math.min(IMAGE_RETRY.capMs, IMAGE_RETRY.baseMs * IMAGE_RETRY.factorMs ** attempt);
  return raw + Math.random() * IMAGE_RETRY.jitterMs;
}

/** Sleep for `ms`, or reject early with ABORTED if the signal fires meanwhile. */
function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new HttpError(499, "ABORTED", "已取消"));
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(t);
      reject(new HttpError(499, "ABORTED", "已取消"));
    };
    t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run an image-generation attempt with bounded retries for transient upstream failures.
 * `sleep`/`maxRetries` are injectable so the retry policy can be unit-tested without
 * real timers or network. On a first-try success the caller pays zero extra latency.
 */
export async function withImageRetry<T>(
  attempt: () => Promise<T>,
  signal?: AbortSignal,
  opts?: { maxRetries?: number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? IMAGE_RETRY.maxRetries;
  const sleep = opts?.sleep ?? realSleep;
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (e) {
      if (signal?.aborted) throw e;
      const retryable = e instanceof HttpError && isRetryableUpstream(e.code, upstreamStatusOf(e));
      if (!retryable || i >= maxRetries) throw e;
      await sleep(backoffMs(i), signal);
    }
  }
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
