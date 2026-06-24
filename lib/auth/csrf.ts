import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/http";

/**
 * Same-origin defense for state-changing requests. Combined with the
 * SameSite=Lax session cookie this blocks cross-site forgery without the
 * fragility of double-submit tokens. Call as the first line of every mutating
 * route handler (login/logout/sessions/chat/image).
 *
 * Browsers send `Origin` on all POST/PATCH/DELETE; if present and it doesn't
 * match the request host, reject. If absent (some same-origin tooling / curl),
 * we fall back to the SameSite cookie as the guard.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;

  // Behind a reverse proxy (e.g. Zeabur) the public host arrives as
  // x-forwarded-host; accept either it or the Host header.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "CSRF", "來源驗證失敗");
  }
  if (originHost !== host) {
    throw new HttpError(403, "CSRF", "跨來源請求被拒絕");
  }
}
