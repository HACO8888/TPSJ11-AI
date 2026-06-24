import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  appendUserMessage,
  autoTitleIfDefault,
  createImageMessage,
  getSession,
} from "@/db/queries";
import { generateImage } from "@/lib/aiClient";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120; // upstream image gen ~23s; wide margin

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ prompt: z.string().trim().min(1).max(2000) });

export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const sessionId = uuidParam.parse((await params).id);
  const { prompt } = await parseJson(req, Body);

  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");

  // Record the user's image request as a text turn (threaded into the conversation).
  const userMsg = await appendUserMessage(sessionId, `/image ${prompt}`);
  await autoTitleIfDefault(sessionId, prompt.slice(0, 30));

  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  const { buf, mime, width, height } = await generateImage(prompt, ac.signal);

  const { imageId, messageId } = await createImageMessage({
    sessionId,
    prompt,
    bytes: buf,
    mime,
    byteLen: buf.length,
    width,
    height,
  });

  return Response.json(
    {
      data: {
        messageId,
        imageId,
        imageUrl: `/api/images/${imageId}`,
        prompt,
        userMessageId: userMsg.id,
        width,
        height,
      },
    },
    { status: 201 },
  );
});
