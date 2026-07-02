import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { images, messages, sessions, users } from "./schema";

/* ------------------------------------ users ------------------------------------ */

export async function getUserByUsername(username: string) {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return row ?? null;
}

export async function getUserById(id: string) {
  const [row] = await db
    .select({ id: users.id, username: users.username, theme: users.theme })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateUserTheme(id: string, theme: "light" | "dark") {
  await db.update(users).set({ theme, updatedAt: new Date() }).where(eq(users.id, id));
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
  attachments: { id: string; url: string }[];
  partial: boolean;
  usage: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Uploaded reference-image ids (no bytes) per message for a session. Used to hang
 * thumbnails on user messages and to annotate the model's context window.
 */
async function uploadedAttachmentsBySession(sessionId: string): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ id: images.id, messageId: images.messageId })
    .from(images)
    .where(and(eq(images.sessionId, sessionId), eq(images.source, "uploaded")))
    .orderBy(asc(images.createdAt));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.messageId) continue;
    const list = map.get(r.messageId) ?? [];
    list.push(r.id);
    map.set(r.messageId, list);
  }
  return map;
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

  const attMap = await uploadedAttachmentsBySession(sessionId);
  return rows.map((m) => ({
    ...m,
    imageUrl: m.imageId ? `/api/images/${m.imageId}` : null,
    attachments: (attMap.get(m.id) ?? []).map((id) => ({ id, url: `/api/images/${id}` })),
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
      id: messages.id,
      role: messages.role,
      kind: messages.kind,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  const attMap = await uploadedAttachmentsBySession(sessionId);
  return rows.map((m) => {
    if (m.kind === "image") {
      return {
        role: "assistant" as const,
        content: `〔系統紀錄：先前已為使用者生成一張圖片，主題「${m.content}」〕`,
      };
    }
    const role = m.role === "user" ? ("user" as const) : ("assistant" as const);
    // Annotate (don't ship bytes) so older turns keep continuity; the current
    // turn's actual image bytes are passed separately by generate.ts.
    const attCount = role === "user" ? (attMap.get(m.id)?.length ?? 0) : 0;
    const content =
      attCount > 0
        ? `${m.content}${m.content ? "\n" : ""}〔使用者附上 ${attCount} 張圖片〕`
        : m.content;
    return { role, content };
  });
}

/**
 * Whether any of the most recent `lastN` messages is a generated image. Used to
 * route terse follow-up edits ("卡通版的", "伸出貓爪") into the image classifier:
 * such messages carry no keyword cue, so without a recent image they would never
 * reach the image branch and the model would fake a "（已產生一張圖片…）" reply.
 */
export async function hasRecentImageMessage(sessionId: string, lastN = 8): Promise<boolean> {
  const rows = await db
    .select({ kind: messages.kind })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(lastN);
  return rows.some((r) => r.kind === "image");
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

export interface UploadInput {
  mime: string;
  bytes: Buffer;
  byteLen: number;
  width: number | null;
  height: number | null;
}

/**
 * Atomically append a user message plus its uploaded 素材 attachments, so a
 * mid-loop failure can't leave a half-written turn (a message with only some of
 * its images). Mirrors createImageMessage's transactional shape.
 */
export async function appendUserMessageWithUploads(
  sessionId: string,
  content: string,
  uploads: UploadInput[],
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(messages)
      .values({ sessionId, role: "user", kind: "text", content })
      .returning({ id: messages.id });
    for (const u of uploads) {
      await tx.insert(images).values({
        sessionId,
        messageId: msg.id,
        source: "uploaded",
        mime: u.mime,
        bytes: u.bytes,
        byteLen: u.byteLen,
        width: u.width,
        height: u.height,
      });
    }
    return { id: msg.id };
  });
}

export interface AttachmentBytes {
  id: string;
  mime: string;
  bytes: Buffer;
}

/** Uploaded reference-image bytes for one message — fed to the model (vision / edit). */
export async function getMessageAttachments(messageId: string): Promise<AttachmentBytes[]> {
  return db
    .select({ id: images.id, mime: images.mime, bytes: images.bytes })
    .from(images)
    .where(and(eq(images.messageId, messageId), eq(images.source, "uploaded")))
    .orderBy(asc(images.createdAt));
}

/** Most recently generated image's bytes — reference for a contextual follow-up edit. */
export async function getLatestGeneratedImage(sessionId: string): Promise<AttachmentBytes | null> {
  const [row] = await db
    .select({ id: images.id, mime: images.mime, bytes: images.bytes })
    .from(images)
    .where(and(eq(images.sessionId, sessionId), eq(images.source, "generated")))
    .orderBy(desc(images.createdAt))
    .limit(1);
  return row ?? null;
}
