import "server-only";
import { cookies } from "next/headers";

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
