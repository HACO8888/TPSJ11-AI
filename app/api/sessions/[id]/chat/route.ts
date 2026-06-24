import type { NextRequest } from "next/server";
import { z } from "zod";
import { appendUserMessage, autoTitleIfDefault, getSession, touchSession } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { buildGenerationStream, sseResponse, titleFrom } from "@/lib/generate";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120; // image generation may run here (~23s)

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ content: z.string().trim().min(1).max(8000) });

export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const sessionId = uuidParam.parse((await params).id);
  const { content } = await parseJson(req, Body);

  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");

  // Record the user turn first so it persists even if upstream dies.
  const userMsg = await appendUserMessage(sessionId, content);
  await autoTitleIfDefault(sessionId, titleFrom(content));
  await touchSession(sessionId);

  const stream = buildGenerationStream({
    sessionId,
    content,
    userMessageId: userMsg.id,
    signal: req.signal,
  });
  return sseResponse(stream);
});
