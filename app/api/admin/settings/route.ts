import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteSetting, listSettings, setSetting } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { clearDriveCache } from "@/lib/drive";
import { HttpError, parseJson, route } from "@/lib/http";
import { requireAdmin } from "@/lib/permissions";
import { clearTeamsCache } from "@/lib/settings";

export const runtime = "nodejs";

function invalidate(key: string) {
  if (key === "google_drive") clearDriveCache();
  if (key === "teams") clearTeamsCache();
}

export const GET = route(async () => {
  await requireAdmin();
  return Response.json({ data: await listSettings() });
});

const PutBody = z.object({ key: z.string().trim().min(1).max(128), value: z.unknown() });

export const PUT = route(async (req: NextRequest) => {
  await requireAdmin();
  assertSameOrigin(req);
  const { key, value } = await parseJson(req, PutBody);
  await setSetting(key, value);
  invalidate(key);
  return Response.json({ data: { ok: true } });
});

export const DELETE = route(async (req: NextRequest) => {
  await requireAdmin();
  assertSameOrigin(req);
  const key = new URL(req.url).searchParams.get("key");
  if (!key) throw new HttpError(400, "BAD_KEY", "缺少 key");
  await deleteSetting(key);
  invalidate(key);
  return new Response(null, { status: 204 });
});
