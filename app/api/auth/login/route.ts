import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserByUsername } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { checkLogin, recordFailure, recordSuccess } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { HttpError, parseJson, route } from "@/lib/http";
import { setThemeCookie, type Theme } from "@/lib/theme-cookie";

export const runtime = "nodejs";

const Body = z.object({
  username: z.string().min(1, "請輸入帳號"),
  password: z.string().min(1, "請輸入密碼"),
});

export const POST = route(async (req: NextRequest) => {
  const limit = checkLogin();
  if (!limit.ok) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "嘗試次數過多，請稍後再試" } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  assertSameOrigin(req);
  const { username, password } = await parseJson(req, Body);

  const user = await getUserByUsername(username);
  // Always run a bcrypt compare (against a dummy hash if no user) for constant timing.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    recordFailure();
    throw new HttpError(401, "INVALID_CREDENTIALS", "帳號或密碼錯誤");
  }

  recordSuccess();
  await createSession(user.id);
  // Seed the SSR theme cookie from the account's saved preference so the first
  // page load after login already paints the right palette (cross-device).
  await setThemeCookie(user.theme as Theme);
  return Response.json({ ok: true });
});
