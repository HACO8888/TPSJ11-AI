import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { images, messages, sessions, users } from "./schema";

/* ------------------------------------ users ------------------------------------ */

export async function getUserByUsername(username: string) {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return row ?? null;
}

/* ----------------------------------- sessions ---------------------------------- */

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export async function listSessions(userId: string): Promise<SessionMeta[]> {
  return db
    .select({
      id: sessions.id,
      title: sessions.title,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      messageCount: sql<number>`count(${messages.id})::int`,
    })
    .from(sessions)
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .where(eq(sessions.userId, userId))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.updatedAt));
}

export async function createSession(userId: string, title?: string) {
  const [row] = await db
    .insert(sessions)
    .values({ userId, ...(title ? { title } : {}) })
    .returning();
  return row;
}

export async function getSession(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function renameSession(userId: string, id: string, title: string) {
  const [row] = await db
    .update(sessions)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteSession(userId: string, id: string) {
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

export async function touchSession(id: string) {
  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, id));
}

/** Set the title only if it is still the default — used for first-turn auto-titling. */
export async function autoTitleIfDefault(id: string, title: string) {
  await db
    .update(sessions)
    .set({ title })
    .where(and(eq(sessions.id, id), eq(sessions.title, "新對話")));
}

/* ----------------------------------- messages ---------------------------------- */

export interface MessageDTO {
  id: string;
  role: string;
  kind: string;
  content: string;
  imageId: string | null;
  imageUrl: string | null;
  partial: boolean;
  usage: Record<string, unknown> | null;
  createdAt: Date;
}

export async function getMessages(sessionId: string): Promise<MessageDTO[]> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      kind: messages.kind,
      content: messages.content,
      imageId: messages.imageId,
      partial: messages.partial,
      usage: messages.usage,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  return rows.map((m) => ({
    ...m,
    imageUrl: m.imageId ? `/api/images/${m.imageId}` : null,
  }));
}

export async function appendUserMessage(sessionId: string, content: string) {
  const [row] = await db
    .insert(messages)
    .values({ sessionId, role: "user", kind: "text", content })
    .returning({ id: messages.id, createdAt: messages.createdAt });
  return row;
}

export async function persistAssistant(
  sessionId: string,
  content: string,
  usage: Record<string, unknown> | null,
  partial: boolean,
) {
  const [row] = await db
    .insert(messages)
    .values({ sessionId, role: "assistant", kind: "text", content, usage, partial })
    .returning({ id: messages.id });
  return row;
}

export async function getMessage(sessionId: string, id: string) {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.sessionId, sessionId)))
    .limit(1);
  return row ?? null;
}

export async function updateMessageContent(id: string, content: string) {
  await db.update(messages).set({ content }).where(eq(messages.id, id));
}

/**
 * Delete every message in the session created strictly after the target message
 * (used by regenerate / edit-and-resend to branch from a turn). The comparison is
 * done DB-to-DB via a subquery so microsecond precision is preserved — passing a
 * JS Date would truncate to milliseconds and could delete the target itself.
 * Cascades drop any images of the removed messages.
 */
export async function deleteMessagesAfter(sessionId: string, targetMessageId: string) {
  await db.execute(sql`
    delete from ${messages}
    where ${messages.sessionId} = ${sessionId}
      and ${messages.createdAt} > (
        select created_at from ${messages} where id = ${targetMessageId}
      )
  `);
}

/* --------------------------------- context window ------------------------------ */

export interface ContextRow {
  role: "user" | "assistant";
  content: string;
}

/**
 * Prior conversation of a session, ASC, mapped for the upstream model.
 * Image rows become a short assistant-role synthetic note so the model has
 * continuity without us shipping ~8MB of base64 back upstream.
 */
export async function loadContextRows(sessionId: string): Promise<ContextRow[]> {
  const rows = await db
    .select({
      role: messages.role,
      kind: messages.kind,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  return rows.map((m) => {
    if (m.kind === "image") {
      return { role: "assistant" as const, content: `（已產生一張圖片：${m.content}）` };
    }
    return {
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    };
  });
}

/* ----------------------------------- images ------------------------------------ */

export interface CreatedImage {
  imageId: string;
  messageId: string;
}

export async function createImageMessage(params: {
  sessionId: string;
  prompt: string;
  bytes: Buffer;
  mime: string;
  byteLen: number;
  width?: number | null;
  height?: number | null;
}): Promise<CreatedImage> {
  return db.transaction(async (tx) => {
    const [img] = await tx
      .insert(images)
      .values({
        sessionId: params.sessionId,
        mime: params.mime,
        bytes: params.bytes,
        byteLen: params.byteLen,
        width: params.width ?? null,
        height: params.height ?? null,
        prompt: params.prompt,
      })
      .returning({ id: images.id });

    const [msg] = await tx
      .insert(messages)
      .values({
        sessionId: params.sessionId,
        role: "assistant",
        kind: "image",
        content: params.prompt,
        imageId: img.id,
      })
      .returning({ id: messages.id });

    await tx.update(images).set({ messageId: msg.id }).where(eq(images.id, img.id));
    await tx
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, params.sessionId));

    return { imageId: img.id, messageId: msg.id };
  });
}

export interface ImageBytes {
  bytes: Buffer;
  mime: string;
  byteLen: number;
}

export async function getImageBytes(id: string): Promise<ImageBytes | null> {
  const [row] = await db
    .select({ bytes: images.bytes, mime: images.mime, byteLen: images.byteLen })
    .from(images)
    .where(eq(images.id, id))
    .limit(1);
  return row ?? null;
}
