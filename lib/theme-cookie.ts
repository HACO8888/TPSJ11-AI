import "server-only";
import { cookies } from "next/headers";
import { getUserById } from "@/db/queries";
import { getAuthUserId } from "@/lib/auth/session";

/**
 * Server-readable theme cookie. Lets the root layout render the correct palette
 * class on <html> during SSR — before any JS runs — so there's zero flash on the
 * very first paint, even on a device that has never loaded the app before.
 *
 * httpOnly: only the server reads/writes it (on login, on theme change, and on
 * every /api/auth/me sync); the client tracks its own state via React state.
 */
export const THEME_COOKIE = "tpsj_theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

export async function setThemeCookie(theme: Theme) {
  (await cookies()).set(THEME_COOKIE, theme, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearThemeCookie() {
  (await cookies()).delete(THEME_COOKIE);
}

/**
 * Resolve the palette for SSR. Prefers the theme cookie (cheap, no DB). If it's
 * missing but the request carries a valid session — e.g. a user who logged in
 * before the theme cookie existed — fall back to the account's saved DB theme so
 * the first paint is still correct (no flash). That DB read is one-shot: the next
 * /api/auth/me sync writes the cookie, and later loads skip the query.
 */
export async function resolveSsrTheme(): Promise<Theme> {
  const cookie = (await cookies()).get(THEME_COOKIE)?.value;
  if (cookie === "dark" || cookie === "light") return cookie;

  const uid = await getAuthUserId();
  if (!uid) return "light";
  const user = await getUserById(uid);
  return user?.theme === "dark" ? "dark" : "light";
}
