import type { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { destroySession } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { clearThemeCookie } from "@/lib/theme-cookie";

export const runtime = "nodejs";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await destroySession();
  // Drop the theme cookie so the login page (and the next account on this
  // browser) starts from the default palette rather than a stale one.
  await clearThemeCookie();
  return new Response(null, { status: 204 });
});
