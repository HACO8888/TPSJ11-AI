import "server-only";
import { getUserById } from "@/db/queries";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";

/**
 * The single admin account. Hardcoded (not DB-configurable) so the admin can never
 * be locked out of the admin panel by an accidental settings change.
 *
 * Per-account upload / cloud-save-folder permissions now live on the users row
 * (users.canUpload / users.saveFolderId), managed from the admin panel — not here.
 */
const ADMIN_USERNAME = "haco";

export function isAdmin(username: string | null | undefined): boolean {
  return username === ADMIN_USERNAME;
}

/** Require the caller to be the admin; returns their id/username. Throws 403 otherwise. */
export async function requireAdmin(): Promise<{ uid: string; username: string }> {
  const uid = await requireAuth();
  const user = await getUserById(uid);
  if (!user || !isAdmin(user.username)) {
    throw new HttpError(403, "FORBIDDEN", "沒有權限");
  }
  return { uid, username: user.username };
}
