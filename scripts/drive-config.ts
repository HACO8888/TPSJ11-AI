import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appSettings } from "../db/schema";

/**
 * Upsert the Google Drive OAuth config into app_settings['google_drive'] from env.
 * Use this when you already have a refresh token (e.g. from scripts/drive-auth.ts).
 *
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... \
 *   GOOGLE_OAUTH_REFRESH_TOKEN=... GDRIVE_TMP_FOLDER_ID=... \
 *   [GDRIVE_ROOT_FOLDER_ID=...] pnpm tsx scripts/drive-config.ts
 */

const KEY = "google_drive";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[drive-config] 缺少環境變數 ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[drive-config] DATABASE_URL 未設定，請先設定 .env");
    process.exit(1);
  }

  const value = {
    clientId: required("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
    refreshToken: required("GOOGLE_OAUTH_REFRESH_TOKEN"),
    tmpFolderId: required("GDRIVE_TMP_FOLDER_ID"),
    rootFolderId: process.env.GDRIVE_ROOT_FOLDER_ID ?? null,
  };

  const client = postgres(url, { max: 1, ssl: false, prepare: false });
  const db = drizzle(client);
  try {
    await db
      .insert(appSettings)
      .values({ key: KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    console.log(
      `\n[drive-config] 已寫入 app_settings['${KEY}']` +
        `\n  clientId    : ${value.clientId.slice(0, 24)}…` +
        `\n  refreshToken: ${value.refreshToken.slice(0, 10)}…（已隱藏）` +
        `\n  tmpFolderId : ${value.tmpFolderId}` +
        `\n  rootFolderId: ${value.rootFolderId ?? "(未設)"}\n`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[drive-config] 失敗:", e);
    process.exit(1);
  });
