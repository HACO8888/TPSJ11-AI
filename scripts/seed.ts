import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../db/schema";
import { generatePassword, hashPassword } from "../lib/auth/password";

const RESET = process.argv.includes("--reset");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] DATABASE_URL 未設定，請先設定 .env");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, ssl: false, prepare: false });
  const db = drizzle(client);

  try {
    const existing = await db.select().from(users).where(eq(users.username, "admin"));

    if (existing.length && !RESET) {
      console.log("\n[seed] admin 已存在。若要重設密碼請執行: pnpm db:seed -- --reset\n");
      return;
    }

    const password = generatePassword(24);
    const passwordHash = await hashPassword(password);

    if (existing.length) {
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.username, "admin"));
    } else {
      await db.insert(users).values({ username: "admin", passwordHash });
    }

    const line = "═".repeat(56);
    console.log(`\n╔${line}╗`);
    console.log("║  管理員帳號已建立 / 密碼已重設");
    console.log(`╠${line}╣`);
    console.log("║  使用者 (username) : admin");
    console.log(`║  密碼  (password)  : ${password}`);
    console.log(`╠${line}╣`);
    console.log("║  ⚠ 此密碼只會顯示這一次，請立即妥善保存。");
    console.log("║  ⚠ 若遺失，請執行: pnpm db:seed -- --reset 重新產生。");
    console.log(`╚${line}╝\n`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed] 失敗:", e);
    process.exit(1);
  });
