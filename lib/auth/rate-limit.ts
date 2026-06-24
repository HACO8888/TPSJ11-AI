// Global in-memory login throttle. Single-admin tool with no trusted proxy, so
// we key on ONE global bucket rather than a spoofable x-forwarded-for IP.
// Limitation: resets on process restart and is per-process — fine for a single
// instance; a DB/Redis store is the upgrade path if horizontally scaled.

interface Bucket {
  count: number;
  resetAt: number;
  lockedUntil: number;
}

const WINDOW_MS = 15 * 60_000; // 15 min
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000; // lock 15 min after exceeding

let bucket: Bucket = { count: 0, resetAt: 0, lockedUntil: 0 };

export type LoginCheck = { ok: true } | { ok: false; retryAfter: number };

export function checkLogin(now: number = Date.now()): LoginCheck {
  if (bucket.lockedUntil > now) {
    return { ok: false, retryAfter: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }
  if (bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS, lockedUntil: 0 };
  }
  return { ok: true };
}

export function recordFailure(now: number = Date.now()) {
  if (bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS, lockedUntil: 0 };
  }
  bucket.count += 1;
  if (bucket.count >= MAX_ATTEMPTS) {
    bucket.lockedUntil = now + LOCK_MS;
  }
}

export function recordSuccess() {
  bucket = { count: 0, resetAt: 0, lockedUntil: 0 };
}
