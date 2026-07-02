import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserById, updateUserTheme } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { getAuthUserId, requireAuth } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { setThemeCookie, type Theme } from "@/lib/theme-cookie";

export const runtime = "nodejs";

export const GET = route(async () => {
  const uid = await getAuthUserId();
  if (!uid) return Response.json({ authenticated: false, username: null, theme: null });
  const user = await getUserById(uid);
  // Keep the SSR cookie in sync with the DB (heals a stale/missing cookie so the
  // next full page load paints correctly without a flash).
  if (user) await setThemeCookie(user.theme as Theme);
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
  await setThemeCookie(theme);
  return Response.json({ ok: true, theme });
});
