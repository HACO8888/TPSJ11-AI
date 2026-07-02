import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea } from "./bytea";

/** Single admin user. Password is bcrypt-hashed; plaintext only ever shown at seed time. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // UI theme preference, synced across devices for the account. 'light' | 'dark'.
  theme: text("theme").notNull().default("light"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A chat session; each holds its own independent conversation context. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("新對話"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/**
 * A message in a session. `kind` = 'text' | 'image'.
 * image_id → images SET NULL breaks the circular FK with images.message_id (CASCADE),
 * so deleting a session cascades cleanly without FK ordering errors.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'system'
    kind: text("kind").notNull().default("text"), // 'text' | 'image'
    content: text("content").notNull(),
    imageId: uuid("image_id").references((): AnyPgColumn => images.id, {
      onDelete: "set null",
    }),
    usage: jsonb("usage").$type<Record<string, unknown> | null>(),
    partial: boolean("partial").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_session_created_idx").on(t.sessionId, t.createdAt)],
);

/** Generated image bytes stored as BYTEA. Never SELECT `bytes` in list/history queries. */
export const images = pgTable(
  "images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references((): AnyPgColumn => messages.id, {
      onDelete: "cascade",
    }),
    // 'generated' = produced by the image model; 'uploaded' = user-supplied 素材
    // (reference image). Uploaded rows hang off a user message; generated rows
    // off an assistant image message.
    source: text("source").notNull().default("generated"),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    byteLen: integer("byte_len").notNull(),
    width: integer("width"),
    height: integer("height"),
    prompt: text("prompt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("images_session_idx").on(t.sessionId)],
);

/**
 * Error log for debugging. Each entry has a short `ref` shown to the operator so
 * they can report it. No FK on session_id — logs must survive session deletion.
 */
export const errorLogs = pgTable(
  "error_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull().unique(),
    scope: text("scope").notNull(),
    code: text("code"),
    status: integer("status"),
    message: text("message"),
    detail: text("detail"),
    sessionId: uuid("session_id"),
    path: text("path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("error_logs_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Image = typeof images.$inferSelect;
export type ErrorLog = typeof errorLogs.$inferSelect;
