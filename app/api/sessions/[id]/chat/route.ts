import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  appendUserMessageWithUploads,
  autoTitleIfDefault,
  getSession,
  touchSession,
} from "@/db/queries";
import { imageSize, sniffMime } from "@/lib/aiClient";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { buildGenerationStream, sseResponse, titleFrom } from "@/lib/generate";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120; // image generation may run here (~23s)

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ content: z.string().trim().min(1).max(8000) });

// 素材 upload limits. mime is sniffed from bytes (client-declared type is ignored).
const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB per file
const MAX_TOTAL = MAX_FILES * MAX_BYTES + 256 * 1024; // hard body cap (+slack for fields/boundaries)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

interface ParsedUpload {
  mime: string;
  bytes: Buffer;
  byteLen: number;
  width: number | null;
  height: number | null;
}

async function parseMultipart(
  req: NextRequest,
): Promise<{ content: string; uploads: ParsedUpload[] }> {
  // Reject oversized bodies before formData() buffers the whole thing into memory.
  const declaredLen = Number(req.headers.get("content-length") ?? 0);
  if (declaredLen > MAX_TOTAL) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "上傳內容過大，請減少張數或壓縮圖片");
  }
  const form = await req.formData();
  const content = (form.get("content") ?? "").toString().trim();
  if (content.length > 8000) throw new HttpError(400, "CONTENT_TOO_LONG", "訊息太長");

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > MAX_FILES) {
    throw new HttpError(400, "TOO_MANY_FILES", `最多只能上傳 ${MAX_FILES} 張圖片`);
  }

  const uploads: ParsedUpload[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      throw new HttpError(400, "FILE_TOO_LARGE", `單張圖片不可超過 ${MAX_BYTES / 1024 / 1024}MB`);
    }
    const bytes = Buffer.from(await f.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!ALLOWED_MIME.has(mime)) {
      throw new HttpError(400, "BAD_IMAGE", "只支援 JPEG / PNG / WebP / GIF 圖片");
    }
    const dims = imageSize(bytes);
    uploads.push({
      mime,
      bytes,
      byteLen: bytes.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    });
  }

  if (!content && uploads.length === 0) {
    throw new HttpError(400, "EMPTY", "請輸入訊息或上傳圖片");
  }
  return { content, uploads };
}

export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const sessionId = uuidParam.parse((await params).id);

  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");

  const isMultipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let content: string;
  let uploads: ParsedUpload[] = [];
  if (isMultipart) {
    ({ content, uploads } = await parseMultipart(req));
  } else {
    ({ content } = await parseJson(req, Body));
  }

  // Record the user turn (+ any 素材) atomically so it persists even if upstream dies.
  const userMsg = await appendUserMessageWithUploads(sessionId, content, uploads);
  await autoTitleIfDefault(sessionId, titleFrom(content || "圖片"));
  await touchSession(sessionId);

  const stream = buildGenerationStream({
    sessionId,
    content,
    userMessageId: userMsg.id,
    signal: req.signal,
  });
  return sseResponse(stream);
});
