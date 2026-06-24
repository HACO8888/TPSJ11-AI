import { type JWTPayload, jwtVerify, SignJWT } from "jose";

// Edge-safe: pure jose, reads process.env directly (NOT the server-only env module),
// so the middleware can import and verify on the edge runtime.

export const SESSION_COOKIE = "tpsj_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)
/** When the remaining lifetime drops below this, middleware re-issues the cookie. */
export const SESSION_REFRESH_THRESHOLD = 60 * 60 * 24; // 1 day (seconds)
const ALG = "HS256";

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 chars");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getKey());
}

export async function verifyToken(token: string | undefined | null): Promise<JWTPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: [ALG] });
    return payload;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number = SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
