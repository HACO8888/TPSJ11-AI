import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  autoTitleIfDefault,
  deleteMessagesAfter,
  getMessage,
  getSession,
  touchSession,
  updateMessageContent,
} from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { buildGenerationStream, sseResponse, titleFrom } from "@/lib/generate";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  messageId: z.string().uuid(),
  content: z.string().trim().min(1).max(8000).optional(),
});

/**
 * Regenerate the reply for a user message (optionally after editing it).
 * Branches from that turn: every message after it is removed, then the
 * chat/image generation re-runs.
 */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const sessionId = uuidParam.parse((await params).id);
  const { messageId, content } = await parseJson(req, Body);

  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");

  const msg = await getMessage(sessionId, messageId);
  if (!msg) throw new HttpError(404, "NOT_FOUND", "找不到該訊息");
  if (msg.role !== "user") throw new HttpError(400, "BAD_TARGET", "只能重新生成你發送的訊息");

  const finalContent = content ?? msg.content;
  if (content && content !== msg.content) {
    await updateMessageContent(messageId, content);
    await autoTitleIfDefault(sessionId, titleFrom(content));
  }

  // Drop the old reply (and any later turns) before regenerating.
  await deleteMessagesAfter(sessionId, messageId);
  await touchSession(sessionId);

  const stream = buildGenerationStream({
    sessionId,
    content: finalContent,
    userMessageId: messageId,
    signal: req.signal,
  });
  return sseResponse(stream);
});
