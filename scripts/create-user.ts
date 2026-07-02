import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../db/schema";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  if (!username || !password) {
    console.error("用法: tsx scripts/create-user.ts <username> <password>");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[create-user] DATABASE_URL 未設定，請先設定 .env");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, ssl: false, prepare: false });
  const db = drizzle(client);

  try {
    const existing = await db.select().from(users).where(eq(users.username, username));
    const passwordHash = await hashPassword(password);

    if (existing.length) {
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.username, username));
      console.log(`\n[create-user] 帳號 "${username}" 已存在 → 已更新密碼。\n`);
    } else {
      await db.insert(users).values({ username, passwordHash });
      console.log(`\n[create-user] 帳號 "${username}" 已建立。\n`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[create-user] 失敗:", e);
    process.exit(1);
  });
