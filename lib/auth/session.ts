import { cookies } from "next/headers";
import { HttpError } from "@/lib/http";
import { cookieOptions, SESSION_COOKIE, signToken, verifyToken } from "./jwt";

/** Sign a fresh token and set the session cookie. Call from a route handler. */
export async function createSession(userId: string) {
  const token = await signToken(userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getAuthUserId(): Promise<string | null> {
  const c = await cookies();
  const payload = await verifyToken(c.get(SESSION_COOKIE)?.value);
  const sub = payload?.sub;
  return typeof sub === "string" ? sub : null;
}

/** Throw a 401 envelope unless authenticated; returns the admin userId. */
export async function requireAuth(): Promise<string> {
  const uid = await getAuthUserId();
  if (!uid) throw new HttpError(401, "UNAUTHENTICATED", "請先登入");
  return uid;
}
