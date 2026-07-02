import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserById, updateUserTheme } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { getAuthUserId, requireAuth } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";

export const runtime = "nodejs";

export const GET = route(async () => {
  const uid = await getAuthUserId();
  if (!uid) return Response.json({ authenticated: false, username: null, theme: null });
  const user = await getUserById(uid);
  return Response.json({
    authenticated: Boolean(user),
    username: user?.username ?? null,
    theme: user?.theme ?? null,
  });
});

const PatchBody = z.object({ theme: z.enum(["light", "dark"]) });

export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const uid = await requireAuth();
  const { theme } = await parseJson(req, PatchBody);
  await updateUserTheme(uid, theme);
  return Response.json({ ok: true, theme });
});
