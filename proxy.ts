import { type NextRequest, NextResponse } from "next/server";
import {
  cookieOptions,
  SESSION_COOKIE,
  SESSION_REFRESH_THRESHOLD,
  signToken,
  verifyToken,
} from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Next 16 "proxy" convention (formerly middleware). Runs on the edge runtime;
// imports only the edge-safe jwt helpers (jose), never db/bcrypt/server-only.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = await verifyToken(token);

  if (!payload?.sub) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "請先登入" } },
        { status: 401 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Sliding refresh: re-issue the cookie when it's close to expiring.
  const res = NextResponse.next();
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const now = Math.floor(Date.now() / 1000);
  if (exp - now < SESSION_REFRESH_THRESHOLD) {
    const fresh = await signToken(payload.sub as string);
    res.cookies.set(SESSION_COOKIE, fresh, cookieOptions());
  }
  return res;
}

export const config = {
  // Exclude Next internals and public metadata routes (icons, OG image, etc.)
  // so crawlers / social cards can fetch them without auth.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
