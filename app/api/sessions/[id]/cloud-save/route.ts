import type { NextRequest } from "next/server";
import { getSession, listGeneratedImages } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { saveSessionImagesToCloud } from "@/lib/drive";
import { HttpError, route, uuidParam } from "@/lib/http";
import { resolveSaveBaseName } from "@/lib/intent";

export const runtime = "nodejs";
export const maxDuration = 120; // several ~8MB uploads may run here

type Ctx = { params: Promise<{ id: string }> };

/**
 * Save all of a session's generated images to Google Drive from the server (never
 * via the user's device). Backs the "儲存到雲端" button; the chat keyword path in
 * lib/generate.ts shares the same saveSessionImagesToCloud core.
 */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const sessionId = uuidParam.parse((await params).id);

  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");

  const imgs = await listGeneratedImages(sessionId);
  if (imgs.length === 0) throw new HttpError(400, "NO_IMAGES", "這個對話還沒有生成過圖片");

  const result = await saveSessionImagesToCloud({
    session: { id: session.id, title: session.title, driveFolderId: session.driveFolderId },
    images: imgs.map((i) => ({ mime: i.mime, bytes: i.bytes })),
    baseName: resolveSaveBaseName(),
  });

  return Response.json({ data: result }, { status: 201 });
});
