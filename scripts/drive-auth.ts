import "dotenv/config";
import { createServer } from "node:http";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appSettings } from "../db/schema";

/**
 * One-time (or re-)authorization for Google Drive cloud save.
 *
 * Prereqs (do these in Google Cloud console for the OAuth client):
 *   1. OAuth client type = Web application (or Desktop app).
 *   2. Add redirect URI  http://localhost:4577  to the client (Web app only).
 *   3. OAuth consent screen published to "Production" (so the refresh token does
 *      NOT expire after 7 days), scope drive.file.
 *
 * Run:
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... \
 *   GDRIVE_TMP_FOLDER_ID=... [GDRIVE_ROOT_FOLDER_ID=...] pnpm drive:auth
 *
 * It prints a URL — open it, sign in as the folder owner, approve — then stores
 * { clientId, clientSecret, refreshToken, tmpFolderId, rootFolderId } into
 * app_settings['google_drive'].
 */

const KEY = "google_drive";
const PORT = Number(process.env.OAUTH_PORT ?? 4577);
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[drive:auth] 缺少環境變數 ${name}`);
    process.exit(1);
  }
  return v;
}

const CLIENT_ID = required("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = required("GOOGLE_OAUTH_CLIENT_SECRET");
const TMP_FOLDER_ID = required("GDRIVE_TMP_FOLDER_ID");
const ROOT_FOLDER_ID = process.env.GDRIVE_ROOT_FOLDER_ID ?? null;
const DATABASE_URL = required("DATABASE_URL");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();

async function exchange(code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const j = (await r.json()) as { refresh_token?: string; error?: string };
  if (!r.ok || !j.refresh_token) {
    throw new Error(`token 交換失敗：${JSON.stringify(j)}`);
  }
  return j.refresh_token;
}

async function persist(refreshToken: string) {
  const client = postgres(DATABASE_URL, { max: 1, ssl: false, prepare: false });
  const db = drizzle(client);
  const value = {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    refreshToken,
    tmpFolderId: TMP_FOLDER_ID,
    rootFolderId: ROOT_FOLDER_ID,
  };
  try {
    await db
      .insert(appSettings)
      .values({ key: KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  } finally {
    await client.end({ timeout: 5 });
  }
}

console.log(
  `\n[drive:auth] 請用瀏覽器打開以下連結，以「資料夾擁有者」帳號登入並同意授權：\n\n${authUrl}\n`,
);
console.log(`[drive:auth] 等待授權中（listening ${REDIRECT}）…\n`);

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", REDIRECT);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (!code && !err) {
    res.writeHead(204).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h2>授權完成，可以關掉這個分頁回終端機。</h2>");
  server.close();

  try {
    if (err) throw new Error(`同意畫面回傳錯誤：${err}`);
    const refreshToken = await exchange(code as string);
    await persist(refreshToken);
    console.log("[drive:auth] ✓ 已取得 refresh token 並寫入 app_settings['google_drive']。\n");
    process.exit(0);
  } catch (e) {
    console.error("[drive:auth] ✗ 失敗:", e);
    process.exit(1);
  }
});

server.listen(PORT);
