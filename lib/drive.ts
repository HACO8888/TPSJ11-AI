import "server-only";
import { randomBytes } from "node:crypto";
import { getSetting, setSessionDriveFolder } from "@/db/queries";
import { HttpError } from "./http";
import { compressForCloud } from "./imageCompress";

/**
 * Google Drive uploader (OAuth, folder owner's account).
 *
 * The service-account route is a dead end for a personal My Drive folder — a
 * service account has no storage quota, so Drive rejects its uploads with
 * `storageQuotaExceeded`. Instead we authorize as the folder owner via OAuth and
 * reuse their refresh token; files are then owned by (and counted against) that
 * account. Scope is `drive.file`: we never *search* Drive (which that scope can't
 * do for files the app didn't create) — we create per-session folders under a
 * known `tmpFolderId` and remember each folder id on the session row.
 */

const SETTINGS_KEY = "google_drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

interface DriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Existing folder under which one subfolder per session is created. */
  tmpFolderId: string;
  /** The visible root ("雷雕作品") — kept for reference only. */
  rootFolderId?: string;
}

function isConfig(v: Partial<DriveConfig> | null): v is DriveConfig {
  return Boolean(v?.clientId && v?.clientSecret && v?.refreshToken && v?.tmpFolderId);
}

// Module-level caches: config rarely changes and access tokens last ~1h. Both are
// cleared by clearDriveCache() after a re-auth writes new settings.
let cfgCache: DriveConfig | null = null;
let tokenCache: { token: string; exp: number } | null = null;

export function clearDriveCache(): void {
  cfgCache = null;
  tokenCache = null;
}

async function readConfig(): Promise<DriveConfig | null> {
  if (cfgCache) return cfgCache;
  const raw = await getSetting<Partial<DriveConfig>>(SETTINGS_KEY);
  if (!isConfig(raw)) return null;
  cfgCache = raw;
  return raw;
}

/** Whether cloud save is usable (config present). Used to gate the UI button. */
export async function isDriveConfigured(): Promise<boolean> {
  return (await readConfig()) !== null;
}

async function loadConfig(): Promise<DriveConfig> {
  const cfg = await readConfig();
  if (!cfg) {
    throw new HttpError(503, "DRIVE_NOT_CONFIGURED", "雲端儲存尚未設定（缺 Google Drive 授權）");
  }
  return cfg;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;

  const cfg = await loadConfig();
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  }).catch((e) => {
    throw new HttpError(502, "DRIVE_TOKEN", "無法連線 Google 換取權杖", { cause: String(e) });
  });

  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) {
    throw new HttpError(502, "DRIVE_TOKEN", "Google 權杖更新失敗（可能需重新授權）", {
      status: r.status,
      body: j,
    });
  }
  tokenCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

async function driveFetch(
  token: string,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  }).catch((e) => {
    throw new HttpError(502, "DRIVE_API", "無法連線 Google Drive", { cause: String(e) });
  });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (!r.ok) {
    const reason = (json?.error as { message?: string } | undefined)?.message ?? r.statusText;
    throw new HttpError(502, "DRIVE_API", `Google Drive 操作失敗：${reason}`, {
      status: r.status,
      body: json,
    });
  }
  return json;
}

async function createFolder(token: string, parentId: string, name: string): Promise<string> {
  const j = await driveFetch(token, `${DRIVE_FILES}?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  return j.id as string;
}

interface UploadedFile {
  id: string;
  name: string;
  webViewLink?: string;
}

async function uploadFile(
  token: string,
  folderId: string,
  name: string,
  mime: string,
  bytes: Buffer,
): Promise<UploadedFile> {
  const boundary = `drive-${randomBytes(8).toString("hex")}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
        name,
        parents: [folderId],
      })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const j = await driveFetch(
    token,
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return { id: j.id as string, name: j.name as string, webViewLink: j.webViewLink as string };
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

// A session folder name from the session title (Drive-safe), else a short id.
function folderNameForSession(session: SessionLike): string {
  const cleaned = session.title
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned && cleaned !== "新對話" ? cleaned : `對話-${session.id.slice(0, 8)}`;
}

async function ensureSessionFolder(token: string, session: SessionLike): Promise<string> {
  if (session.driveFolderId) return session.driveFolderId;
  const cfg = await loadConfig();
  const id = await createFolder(token, cfg.tmpFolderId, folderNameForSession(session));
  await setSessionDriveFolder(session.id, id);
  return id;
}

export interface SessionLike {
  id: string;
  title: string;
  driveFolderId: string | null;
}

export interface SavedFile {
  name: string;
  link?: string;
}

export interface CloudSaveResult {
  count: number;
  files: SavedFile[];
  folderId: string;
  folderLink: string;
}

/** Which rendition(s) to upload: the original bytes, a compressed ≤2MB JPEG, or both. */
export type CloudSaveVariant = "original" | "small" | "both";

/**
 * Upload every given image into the session's own Drive folder (created on first
 * use). Files are named `${baseName}_${n}.${ext}` with n running 1..N in the order
 * given (callers pass oldest → newest). `variant` picks original / 小 size / both;
 * for "both" the small one gets a `_小.jpg` suffix. Throws HttpError on any failure.
 */
export async function saveSessionImagesToCloud(params: {
  session: SessionLike;
  images: { mime: string; bytes: Buffer }[];
  baseName: string;
  variant?: CloudSaveVariant;
}): Promise<CloudSaveResult> {
  const { session, images, baseName, variant = "original" } = params;
  if (images.length === 0) {
    throw new HttpError(400, "NO_IMAGES", "這個對話還沒有生成過圖片");
  }
  const token = await getAccessToken();
  const folderId = await ensureSessionFolder(token, session);

  const files: SavedFile[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const n = i + 1;

    if (variant !== "small") {
      const name = `${baseName}_${n}.${extFromMime(img.mime)}`;
      const up = await uploadFile(token, folderId, name, img.mime, img.bytes);
      files.push({ name: up.name || name, link: up.webViewLink });
    }
    if (variant !== "original") {
      const small = await compressForCloud(img.bytes);
      const name = `${baseName}_${n}${variant === "both" ? "_小" : ""}.jpg`;
      const up = await uploadFile(token, folderId, name, small.mime, small.bytes);
      files.push({ name: up.name || name, link: up.webViewLink });
    }
  }

  return {
    count: files.length,
    files,
    folderId,
    folderLink: `https://drive.google.com/drive/folders/${folderId}`,
  };
}
