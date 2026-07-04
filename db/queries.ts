import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { appSettings, errorLogs, images, messages, sessions, users } from "./schema";

/* ------------------------------------ users ------------------------------------ */

export async function getUserByUsername(username: string) {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return row ?? null;
}

export async function getUserById(id: string) {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      theme: users.theme,
      canUpload: users.canUpload,
      saveFolderId: users.saveFolderId,
    })
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
      // Only count live messages (soft-deleted regenerate branches don't show).
      messageCount: sql<number>`cast(count(${messages.id}) filter (where ${messages.deletedAt} is null) as int)`,
    })
    .from(sessions)
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt)))
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
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.deletedAt)))
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

/**
 * Soft-delete a user's own session: mark it deleted rather than removing the row,
 * so the admin can still review (and restore) it. Idempotent — only flips rows
 * that are still live. Returns true if a live session was actually deleted.
 */
export async function deleteSession(userId: string, id: string) {
  const rows = await db
    .update(sessions)
    .set({ deletedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.deletedAt)))
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
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
    .orderBy(asc(messages.createdAt));

  const attMap = await uploadedAttachmentsBySession(sessionId);
  return rows.map((m) => ({
    ...m,
    imageUrl: m.imageId ? `/api/images/${m.imageId}` : null,
    attachments: (attMap.get(m.id) ?? []).map((id) => ({ id, url: `/api/images/${id}` })),
  }));
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
    .where(and(eq(messages.id, id), eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** The earliest message's id in a session — the one the auto-title is derived from. */
export async function getFirstMessageId(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
    .orderBy(asc(messages.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function updateMessageContent(id: string, content: string) {
  await db.update(messages).set({ content }).where(eq(messages.id, id));
}

/**
 * Soft-delete every live message in the session created strictly after the target
 * message (used by regenerate / edit-and-resend to branch from a turn). The
 * comparison is done DB-to-DB via a subquery so microsecond precision is preserved
 * — passing a JS Date would truncate to milliseconds and could delete the target
 * itself. Superseded turns (and their images) stay in the DB so the admin can
 * still review the branch that was regenerated away; live queries filter them out.
 */
export async function deleteMessagesAfter(sessionId: string, targetMessageId: string) {
  await db.execute(sql`
    update ${messages}
    set deleted_at = now()
    where ${messages.sessionId} = ${sessionId}
      and ${messages.deletedAt} is null
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
      // For image / mixed turns this is the real generation prompt (mixed rows store a
      // user-facing caption in content, so the prompt must come from the image row).
      imagePrompt: images.prompt,
    })
    .from(messages)
    .leftJoin(images, eq(images.id, messages.imageId))
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
    .orderBy(asc(messages.createdAt));

  const attMap = await uploadedAttachmentsBySession(sessionId);
  return rows.map((m) => {
    // image / mixed turns → a synthetic note keyed on the actual generation prompt.
    // We deliberately do NOT feed a mixed turn's caption back as assistant speech: a
    // caption like "這是為你生成的海報" is exactly the phrasing SYSTEM_PROMPT forbids,
    // and echoing it into context would teach the model to fake images on later
    // text-only turns.
    if (m.kind === "image" || m.kind === "mixed") {
      const subject = m.imagePrompt ?? m.content;
      return {
        role: "assistant" as const,
        content: `〔系統紀錄：先前已為使用者生成一張圖片，主題「${subject}」〕`,
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
    .select({ imageId: messages.imageId })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(lastN);
  // Any turn carrying an image (kind 'image' OR 'mixed') counts, so a terse edit
  // follow-up after a text+image turn still reaches the classifier.
  return rows.some((r) => r.imageId != null);
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
  /**
   * Optional user-facing caption. When present → a text+image "mixed" turn:
   * kind='mixed', messages.content = caption (the raw generation prompt is still
   * kept in images.prompt). A blank/whitespace caption normalises back to a plain
   * kind='image' turn with content = prompt (so the prompt is never lost).
   */
  caption?: string | null;
}): Promise<CreatedImage> {
  const cap = params.caption?.trim();
  const kind = cap ? "mixed" : "image";
  const content = cap || params.prompt;
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
        kind,
        content,
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
    // Skip images whose message was regenerated away (soft-deleted) — the user
    // has branched off them, so they must not resurface as an edit reference.
    .innerJoin(messages, eq(messages.id, images.messageId))
    .where(
      and(
        eq(images.sessionId, sessionId),
        eq(images.source, "generated"),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(images.createdAt))
    .limit(1);
  return row ?? null;
}

export interface GeneratedImageRow {
  id: string;
  mime: string;
  bytes: Buffer;
  prompt: string | null;
  createdAt: Date;
}

/**
 * Every generated image in a session, oldest → newest — the set uploaded on a
 * cloud save. ASC order is what gives files their _1.._N suffix (oldest = 1).
 */
export async function listGeneratedImages(sessionId: string): Promise<GeneratedImageRow[]> {
  return (
    db
      .select({
        id: images.id,
        mime: images.mime,
        bytes: images.bytes,
        prompt: images.prompt,
        createdAt: images.createdAt,
      })
      .from(images)
      // Exclude images from regenerated-away (soft-deleted) turns so a cloud save
      // only pushes the images the user still sees in the conversation.
      .innerJoin(messages, eq(messages.id, images.messageId))
      .where(
        and(
          eq(images.sessionId, sessionId),
          eq(images.source, "generated"),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(asc(images.createdAt))
  );
}

/* --------------------------------- cloud save ---------------------------------- */

export interface SessionRow {
  id: string;
  title: string;
  driveFolderId: string | null;
  /** Owner's username / cloud-save target folder — routes the save to the right place. */
  username: string | null;
  saveFolderId: string | null;
}

/** Session by id alone (ownership already checked upstream) — for the cloud-save flow. */
export async function getSessionRow(sessionId: string): Promise<SessionRow | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      driveFolderId: sessions.driveFolderId,
      username: users.username,
      saveFolderId: users.saveFolderId,
    })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

/** Remember the Drive folder created for a session so we never duplicate it. */
export async function setSessionDriveFolder(
  sessionId: string,
  driveFolderId: string,
): Promise<void> {
  await db.update(sessions).set({ driveFolderId }).where(eq(sessions.id, sessionId));
}

/* ---------------------------------- settings ----------------------------------- */

/** Read a runtime setting blob (e.g. the Google Drive config or team list). */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

/** Upsert a runtime setting blob (object or array). */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** All settings (admin: generic key-value editor). */
export async function listSettings(): Promise<{ key: string; value: unknown; updatedAt: Date }[]> {
  return db
    .select({ key: appSettings.key, value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .orderBy(asc(appSettings.key));
}

/** Delete a setting key (admin). */
export async function deleteSetting(key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

/* ------------------------------- admin: accounts ------------------------------- */

export interface AdminUser {
  id: string;
  username: string;
  canUpload: boolean;
  saveFolderId: string | null;
  createdAt: Date;
  sessionCount: number;
}

export async function listUsers(): Promise<AdminUser[]> {
  return db
    .select({
      id: users.id,
      username: users.username,
      canUpload: users.canUpload,
      saveFolderId: users.saveFolderId,
      createdAt: users.createdAt,
      sessionCount: sql<number>`count(${sessions.id})::int`,
    })
    .from(users)
    .leftJoin(sessions, eq(sessions.userId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.username));
}

export async function createUserRow(
  username: string,
  passwordHash: string,
  opts?: { canUpload?: boolean; saveFolderId?: string | null },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      canUpload: opts?.canUpload ?? false,
      saveFolderId: opts?.saveFolderId ?? null,
    })
    .returning({ id: users.id });
  return row;
}

export async function updateUserFlags(
  id: string,
  flags: { canUpload?: boolean; saveFolderId?: string | null },
): Promise<void> {
  const set: Partial<{ canUpload: boolean; saveFolderId: string | null; updatedAt: Date }> = {
    updatedAt: new Date(),
  };
  if (flags.canUpload !== undefined) set.canUpload = flags.canUpload;
  if (flags.saveFolderId !== undefined) set.saveFolderId = flags.saveFolderId;
  await db.update(users).set(set).where(eq(users.id, id));
}

export async function setUserPassword(id: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function deleteUserById(id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

/* --------------------------------- admin: data --------------------------------- */

export interface AdminSession {
  id: string;
  title: string;
  username: string | null;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Every session, including soft-deleted ones (deletedAt marks which). Admin view. */
export async function listAllSessions(): Promise<AdminSession[]> {
  return db
    .select({
      id: sessions.id,
      title: sessions.title,
      username: users.username,
      // Live message count (excludes soft-deleted regenerate branches).
      messageCount: sql<number>`cast(count(${messages.id}) filter (where ${messages.deletedAt} is null) as int)`,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      deletedAt: sessions.deletedAt,
    })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .groupBy(sessions.id, users.username)
    .orderBy(desc(sessions.updatedAt));
}

export interface AdminSessionDetail {
  id: string;
  title: string;
  username: string | null;
  driveFolderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** One session's full meta (ignores soft-delete) for the admin conversation view. */
export async function getSessionAdmin(id: string): Promise<AdminSessionDetail | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      username: users.username,
      driveFolderId: sessions.driveFolderId,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      deletedAt: sessions.deletedAt,
    })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  return row ?? null;
}

export interface AdminMessage {
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
  deletedAt: Date | null;
}

/**
 * Every message of a session for the admin view — INCLUDING soft-deleted ones
 * (deletedAt marks turns removed by the user's regenerate/edit), so the admin can
 * see the full history that was branched away.
 */
export async function getMessagesAdmin(sessionId: string): Promise<AdminMessage[]> {
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
      deletedAt: messages.deletedAt,
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

/** Restore a soft-deleted session (admin). No-op if it wasn't soft-deleted. */
export async function restoreSession(id: string): Promise<void> {
  await db.update(sessions).set({ deletedAt: null }).where(eq(sessions.id, id));
}

/** Permanently delete a session and all its messages/images (admin 永久刪除). */
export async function deleteSessionById(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export interface AdminImage {
  id: string;
  sessionId: string;
  source: string;
  mime: string;
  byteLen: number;
  width: number | null;
  height: number | null;
  prompt: string | null;
  createdAt: Date;
}

export async function listImagesMeta(limit = 300): Promise<AdminImage[]> {
  return db
    .select({
      id: images.id,
      sessionId: images.sessionId,
      source: images.source,
      mime: images.mime,
      byteLen: images.byteLen,
      width: images.width,
      height: images.height,
      prompt: images.prompt,
      createdAt: images.createdAt,
    })
    .from(images)
    .orderBy(desc(images.createdAt))
    .limit(limit);
}

export async function deleteImageById(id: string): Promise<void> {
  await db.delete(images).where(eq(images.id, id));
}

export async function listErrorLogsAdmin(limit = 200) {
  return db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(limit);
}

export async function deleteErrorLogById(id: string): Promise<void> {
  await db.delete(errorLogs).where(eq(errorLogs.id, id));
}

/** Row counts for the admin dashboard. */
export async function adminCounts(): Promise<Record<string, number>> {
  const one = async (t: typeof users | typeof sessions | typeof messages | typeof images) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t);
    return r?.n ?? 0;
  };
  const [u, s, m, i] = await Promise.all([one(users), one(sessions), one(messages), one(images)]);
  return { users: u, sessions: s, messages: m, images: i };
}
