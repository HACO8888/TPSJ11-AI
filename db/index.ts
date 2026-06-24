import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Reuse a single pool across hot-reloads in dev to avoid exhausting the remote
// server's connection slots.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
  __db?: DB;
};

// Create the client + drizzle instance lazily on first query. This defers the
// DATABASE_URL read (and env validation) past `next build`, so builds without
// runtime env (Zeabur/Docker) don't fail when collecting page data.
function init(): DB {
  if (globalForDb.__db) return globalForDb.__db;

  const client =
    globalForDb.__pgClient ??
    postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: false, // remote server has TLS off (verified SHOW ssl=off)
      prepare: false,
    });

  const database = drizzle(client, { schema });
  if (env.NODE_ENV !== "production") {
    globalForDb.__pgClient = client;
    globalForDb.__db = database;
  }
  return database;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = init() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});
