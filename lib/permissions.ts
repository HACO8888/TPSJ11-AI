import "server-only";

/**
 * Accounts allowed to upload 素材 (reference images) via the composer's "+" button.
 * Server-authoritative: the client never sees this list, only a computed `canUpload`
 * boolean from /api/auth/me, and the chat upload endpoint re-checks it server-side.
 */
const IMAGE_UPLOAD_USERNAMES = new Set(["AH031", "AH044", "AH008", "AH068", "haco"]);

export function canUploadImages(username: string | null | undefined): boolean {
  return typeof username === "string" && IMAGE_UPLOAD_USERNAMES.has(username);
}
