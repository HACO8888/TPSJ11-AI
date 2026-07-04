import "server-only";
import { countUserImagesToday, getSetting } from "@/db/queries";

/**
 * Lightweight per-user image-generation guardrail. Image generation is the expensive
 * operation (~8MB / ~23s / burns upstream quota), so a single misfiring loop or a busy
 * moment could exhaust the shared provider quota for everyone. Two limits:
 *   • dailyLimit    — generated images per user per (Taipei) day, counted from the DB.
 *   • maxConcurrent — in-flight generations per user, tracked in-memory (per instance).
 *
 * Limits live in app_settings ('image_quota') so an admin can tune them without a
 * redeploy. Over-limit degrades to a friendly chat reply (see generate.ts), never a
 * scary error — matching the app's existing UPSTREAM_CAPACITY behaviour.
 */

export interface ImageQuotaConfig {
  dailyLimit: number;
  maxConcurrent: number;
}

const DEFAULTS: ImageQuotaConfig = { dailyLimit: 40, maxConcurrent: 2 };

export async function getImageQuota(): Promise<ImageQuotaConfig> {
  const raw = await getSetting<Partial<ImageQuotaConfig>>("image_quota");
  return {
    dailyLimit: Number(raw?.dailyLimit) > 0 ? Number(raw?.dailyLimit) : DEFAULTS.dailyLimit,
    maxConcurrent:
      Number(raw?.maxConcurrent) > 0 ? Number(raw?.maxConcurrent) : DEFAULTS.maxConcurrent,
  };
}

// In-flight generations per user (this server instance). Reset on restart — acceptable
// for a single-instance deployment; the daily count is the durable, cross-instance limit.
const inFlight = new Map<string, number>();

export type QuotaDenied = { ok: false; reason: "daily" | "concurrent" };
export type QuotaGranted = { ok: true };

/**
 * Try to reserve an image-generation slot for a user. On success the caller MUST call
 * releaseImageSlot in a finally. On failure nothing is reserved.
 */
export async function acquireImageSlot(userId: string): Promise<QuotaGranted | QuotaDenied> {
  const cfg = await getImageQuota();
  const running = inFlight.get(userId) ?? 0;
  if (running >= cfg.maxConcurrent) return { ok: false, reason: "concurrent" };
  const today = await countUserImagesToday(userId);
  if (today >= cfg.dailyLimit) return { ok: false, reason: "daily" };
  inFlight.set(userId, running + 1);
  return { ok: true };
}

export function releaseImageSlot(userId: string): void {
  const running = inFlight.get(userId) ?? 0;
  if (running <= 1) inFlight.delete(userId);
  else inFlight.set(userId, running - 1);
}
