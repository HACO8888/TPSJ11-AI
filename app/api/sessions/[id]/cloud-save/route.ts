import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSession, getUserById, listGeneratedImages } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { saveSessionImagesToCloud } from "@/lib/drive";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";
import { getTeamByCode } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 120; // several ~8MB uploads (× variants) may run here

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  size: z.enum(["original", "small", "both"]).default("original"),
  teamCode: z.string().trim().min(1, "請選擇小隊"),
});

/**
 * Save a session's generated images to Google Drive from the server. The button
 * requires a team (images land in that team's shared folder) and a size (original
 * / 小 size / both). The target base folder comes from the account (users.saveFolderId).
 */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const sessionId = uuidParam.parse((await params).id);

  const session = await getSession(uid, sessionId);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");

  const { size, teamCode } = await parseJson(req, Body);
  const team = await getTeamByCode(teamCode);
  if (!team) throw new HttpError(400, "BAD_TEAM", "找不到這個小隊");

  const imgs = await listGeneratedImages(sessionId);
  if (imgs.length === 0) throw new HttpError(400, "NO_IMAGES", "這個對話還沒有生成過圖片");

  const user = await getUserById(uid);

  const result = await saveSessionImagesToCloud({
    session: { id: session.id, title: session.title, driveFolderId: session.driveFolderId },
    images: imgs.map((i) => ({ mime: i.mime, bytes: i.bytes })),
    baseName: team.code,
    variant: size,
    baseFolderId: user?.saveFolderId ?? undefined,
    team,
  });

  return Response.json({ data: result }, { status: 201 });
});
