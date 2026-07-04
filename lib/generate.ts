import "server-only";
import {
  createImageMessage,
  getLatestGeneratedImage,
  getMessageAttachments,
  getSessionRow,
  hasRecentImageMessage,
  listGeneratedImages,
  loadContextRows,
  persistAssistant,
} from "@/db/queries";
import { env } from "@/lib/env";
import {
  type ChatContent,
  chatOnce,
  chatStream,
  generateImage,
  generateImageEdit,
  type ImageReference,
  imageChatOnce,
} from "./aiClient";
import { buildContext } from "./context";
import { saveSessionImagesToCloud } from "./drive";
import { logError } from "./errors";
import { HttpError } from "./http";
import { acquireImageSlot, releaseImageSlot } from "./image-quota";
import { enhanceImagePrompt } from "./imagePrompt";
import {
  classifyImageIntent,
  draftImageCaption,
  type HistoryTurn,
  hasCloudSaveCue,
  hasImageCue,
  type ImageVerdict,
  isBareImageRequest,
  isLikelyImageEdit,
  resolveSaveBaseName,
} from "./intent";
import { parseSseFrames } from "./sse";
import type { SseEventName } from "./sse-types";
import { imageFailureAction } from "./upstream-errors";

const IMAGE_PREFIX = "/image ";

export function titleFrom(content: string): string {
  const t = content
    .replace(/\s+/g, " ")
    .replace(/^\/image\s+/, "")
    .trim();
  return t.length > 30 ? `${t.slice(0, 30)}…` : t;
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/* --------------------------------- routing ------------------------------------- */

export interface RouteInput {
  content: string;
  /** content started with the "/image " prefix (explicit image request). */
  forced: boolean;
  forcedPrompt: string;
  history: HistoryTurn[];
  /** whether any earlier assistant turn exists (a bare "幫我畫" on turn 1 is vague). */
  hasPriorContent: boolean;
  /** a recently generated image exists → terse edit-looking follow-ups may be edits. */
  recentImage: boolean;
  /** this turn's uploaded 素材 (reference images). */
  attachments: ImageReference[];
}

export interface RouteResult {
  kind: "chat" | "image";
  imagePrompt: string;
  imageRef: ImageReference | null;
  /** an image was wanted but the request is too vague → canned clarification, no LLM call. */
  vagueImage: boolean;
  /** the classifier's user-facing caption (text half of a mixed turn); "" for forced/vague. */
  caption: string;
}

export interface RouteDeps {
  classify: (
    content: string,
    history: HistoryTurn[],
    signal: AbortSignal | undefined,
    opts?: { hasAttachment?: boolean },
  ) => Promise<ImageVerdict>;
  /** resolve the previous generated image to use as an i2i reference (for edits). */
  getEditRef: () => Promise<ImageReference | null>;
  signal?: AbortSignal;
}

/**
 * Decide whether a turn is a chat or an image request (and with what prompt / edit
 * reference), extracted from buildGenerationStream so the branch matrix — forced prefix,
 * uploaded 素材, keyword cue, terse edit after a recent image, bare vague request — can
 * be unit-tested with a fake classifier (no network/DB). Behaviour is unchanged.
 */
export async function decideImageRoute(input: RouteInput, deps: RouteDeps): Promise<RouteResult> {
  const { content, forced, forcedPrompt, history, hasPriorContent, recentImage, attachments } =
    input;
  const hasAttachment = attachments.length > 0;

  let kind: "chat" | "image" = "chat";
  let imagePrompt = "";
  let imageRef: ImageReference | null = null;
  let vagueImage = false;
  let caption = "";

  if (forced && forcedPrompt) {
    kind = "image";
    imagePrompt = forcedPrompt;
    if (hasAttachment) imageRef = attachments[0];
    // forced skips the classifier → no caption yet; the caller drafts one.
  } else if (hasAttachment) {
    // Uploaded 素材 → either transform it into a new image, or answer about it.
    const verdict = await deps.classify(content, history, deps.signal, { hasAttachment: true });
    if (verdict.image && verdict.prompt) {
      kind = "image";
      imagePrompt = verdict.prompt;
      imageRef = attachments[0];
      caption = verdict.caption;
    }
    // else → chat branch does vision Q&A over the attachment(s).
  } else if (hasImageCue(content) || (recentImage && isLikelyImageEdit(content))) {
    // The recentImage path only fires for short edit-looking follow-ups
    // ("卡通版的", "換成藍色背景") — plain chat after an image stays instant.
    if (isBareImageRequest(content) && !hasPriorContent) {
      // First-turn "幫我畫" with nothing to draw — instant canned clarification.
      vagueImage = true;
    } else {
      // Context-aware: can turn an earlier turn into a concrete image prompt.
      const verdict = await deps.classify(content, history, deps.signal);
      if (verdict.image && verdict.ready && verdict.prompt) {
        kind = "image";
        imagePrompt = verdict.prompt;
        caption = verdict.caption;
        // A genuine edit of the previous image → reuse it as the i2i reference.
        if (verdict.edit && recentImage) imageRef = await deps.getEditRef();
      } else if (verdict.image) {
        vagueImage = true;
      }
    }
  }

  return { kind, imagePrompt, imageRef, vagueImage, caption };
}

/* ------------------------------ generation stream ------------------------------ */

/**
 * The shared chat/image generation core. Given a session and the (already
 * persisted) user message, it routes to image generation or streamed chat and
 * emits a normalized SSE stream. Used by both /chat and /regenerate.
 */
export function buildGenerationStream(opts: {
  sessionId: string;
  userId: string;
  content: string;
  userMessageId: string;
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  const { sessionId, userId, content, userMessageId, signal } = opts;

  const encoder = new TextEncoder();
  const sse = (event: SseEventName, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const upstreamAbort = new AbortController();
  signal.addEventListener("abort", () => upstreamAbort.abort());

  const forced = content.startsWith(IMAGE_PREFIX);
  const forcedPrompt = forced ? content.slice(IMAGE_PREFIX.length).trim() : "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SseEventName, data: unknown) => controller.enqueue(sse(event, data));
      emit("meta", { userMessageId, sessionId });
      let full = "";
      let usage: Record<string, unknown> | null = null;

      try {
        // ---- Cloud-save branch (keyword-triggered, highest priority) ----
        // "存到雲端" pushes this session's generated images to Drive, server-side.
        // It short-circuits before any image/chat routing or LLM call.
        if (hasCloudSaveCue(content)) {
          emit("route", { kind: "chat" });
          const reply = async (text: string) => {
            const saved = await persistAssistant(sessionId, text, null, false);
            emit("delta", { text });
            emit("done", { assistantMessageId: saved.id });
            controller.close();
          };
          try {
            const [session, imgs] = await Promise.all([
              getSessionRow(sessionId),
              listGeneratedImages(sessionId),
            ]);
            if (!session) throw new HttpError(404, "NOT_FOUND", "找不到對話");
            if (imgs.length === 0) {
              await reply(
                "這個對話目前還沒有生成過圖片，所以沒有可以儲存到雲端的內容喔。先讓我幫你生成一張吧！🔥",
              );
              return;
            }
            const result = await saveSessionImagesToCloud({
              session,
              images: imgs.map((i) => ({ mime: i.mime, bytes: i.bytes })),
              baseName: resolveSaveBaseName(content),
              baseFolderId: session.saveFolderId ?? undefined,
            });
            const list = result.files.map((f) => `・${f.name}`).join("\n");
            await reply(
              `已把這個對話的 ${result.count} 張圖片儲存到雲端 📁\n資料夾：「${session.title}」\n${list}\n\n${result.folderLink}`,
            );
          } catch (e) {
            const he = e instanceof HttpError ? e : new HttpError(502, "DRIVE", "雲端儲存失敗", e);
            const ref = await logError({
              scope: "generate.cloud-save",
              code: he.code,
              status: he.status,
              message: he.message,
              detail: he.details ?? e,
              sessionId,
            });
            const friendly =
              he.code === "DRIVE_NOT_CONFIGURED"
                ? "雲端儲存還沒設定好（缺 Google Drive 授權），請通知管理員。"
                : `儲存到雲端時發生問題，請稍後再試。（錯誤編號：${ref}）`;
            await reply(friendly);
          }
          return;
        }

        // Load routing inputs concurrently — these three DB reads are independent.
        const [history, recentImage, attachments] = await Promise.all([
          loadContextRows(sessionId),
          hasRecentImageMessage(sessionId),
          getMessageAttachments(userMessageId),
        ]);
        const hasPriorContent = history.slice(0, -1).some((r) => r.role === "assistant");
        const hasAttachment = attachments.length > 0;

        // ---- Route: image vs chat ----
        const {
          kind,
          imagePrompt,
          imageRef,
          vagueImage,
          caption: routeCaption,
        } = await decideImageRoute(
          {
            content,
            forced,
            forcedPrompt,
            history,
            hasPriorContent,
            recentImage,
            attachments,
          },
          {
            classify: classifyImageIntent,
            getEditRef: () => getLatestGeneratedImage(sessionId),
            signal: upstreamAbort.signal,
          },
        );

        // ---- Vague image request → instant canned clarification (no LLM call) ----
        if (vagueImage) {
          emit("route", { kind: "chat" });
          const msg =
            "好的，我可以幫你生成圖片！請描述你想要的內容（主題、風格、場景），" +
            "例如「童軍在營火旁搭帳篷、溫暖插畫風」，我就會為你繪製。🔥";
          const saved = await persistAssistant(sessionId, msg, null, false);
          emit("delta", { text: msg });
          emit("done", { assistantMessageId: saved.id });
          controller.close();
          return;
        }

        // ---- Image branch ----
        // On failure this may fall through to the chat branch with a hint (so the
        // assistant can ask for a clearer prompt / explain it couldn't generate).
        let fallbackHint: "rejected" | "no-output" | null = null;
        if (kind === "image") {
          // Per-user image quota / concurrency guard. Over-limit degrades to a friendly
          // chat reply (never a scary error). The slot is released in the finally that
          // wraps the whole branch — covering success, fall-through-to-chat, and throws.
          const slot = await acquireImageSlot(userId);
          if (!slot.ok) {
            emit("route", { kind: "chat" });
            const msg =
              slot.reason === "daily"
                ? "今天的生圖次數已經達到上限囉，明天再來吧！文字問答仍可正常使用 🙂"
                : "你已經有一張圖正在生成中，請等它完成後再送下一張 🙏";
            const saved = await persistAssistant(sessionId, msg, null, false);
            emit("delta", { text: msg });
            emit("done", { assistantMessageId: saved.id });
            controller.close();
            return;
          }
          try {
            // ---- Strategy A (experimental, flag-gated): single native text+image call ----
            // Tried silently and non-streaming so a no-image response can fall back to the
            // classic two-step flow below without having streamed half a reply (avoids the
            // double-text problem). i2i edits keep the dedicated /images/edits path.
            if (env.AI_NATIVE_INTERLEAVE === "on" && !imageRef) {
              try {
                const native = await imageChatOnce(
                  enhanceImagePrompt(imagePrompt),
                  upstreamAbort.signal,
                );
                if (native.image) {
                  const cap = env.MIXED_OUTPUT === "on" ? native.text.trim() || routeCaption : "";
                  const { imageId, messageId } = await createImageMessage({
                    sessionId,
                    prompt: imagePrompt,
                    bytes: native.image.buf,
                    mime: native.image.mime,
                    byteLen: native.image.buf.length,
                    width: native.image.width,
                    height: native.image.height,
                    caption: cap || null,
                  });
                  emit("route", { kind: cap ? "mixed" : "image", prompt: imagePrompt });
                  if (cap) emit("delta", { text: cap });
                  emit("image", {
                    imageId,
                    messageId,
                    imageUrl: `/api/images/${imageId}`,
                    prompt: imagePrompt,
                  });
                  emit("done", { assistantMessageId: messageId });
                  controller.close();
                  return;
                }
                // no image in the native reply → fall through to Strategy B
              } catch (e) {
                await logError({
                  scope: "generate.native-interleave",
                  code: "NATIVE_FALLBACK",
                  message: "原生交錯輸出失敗或無圖，回落標準生圖流程",
                  detail: e instanceof HttpError ? (e.details ?? e) : e,
                  sessionId,
                }).catch(() => {});
                // fall through to Strategy B
              }
            }

            // Text+image "mixed" turn: stream a short caption first (instant), then the
            // ~23s image. MIXED_OUTPUT=off falls back to the classic image-only reply.
            // The caption comes free from the classifier; a forced "/image" drafts one.
            const mixed = env.MIXED_OUTPUT === "on";
            const caption = mixed
              ? routeCaption || (await draftImageCaption(imagePrompt, upstreamAbort.signal))
              : "";
            emit("route", { kind: mixed ? "mixed" : "image", prompt: imagePrompt });
            // Caption is NOT accumulated into `full`: on a generation failure the chat
            // fallback re-emits route:chat (client resets its buffer) and persists only
            // the fallback text; the mixed row's caption is written by createImageMessage
            // on success. Aborting mid-generation drops the shown caption (no persist) —
            // same as the pre-mixed image-abort behaviour.
            if (caption) emit("delta", { text: caption });
            try {
              // Enhance only the prompt actually sent to the model (quality/style tail);
              // the DB keeps the original imagePrompt for display / context continuity.
              const genPrompt = enhanceImagePrompt(imagePrompt);
              const { buf, mime, width, height } = imageRef
                ? await generateImageEdit(genPrompt, imageRef, upstreamAbort.signal)
                : await generateImage(genPrompt, upstreamAbort.signal);
              const { imageId, messageId } = await createImageMessage({
                sessionId,
                prompt: imagePrompt,
                bytes: buf,
                mime,
                byteLen: buf.length,
                width,
                height,
                caption: mixed ? caption : null,
              });
              emit("image", {
                imageId,
                messageId,
                imageUrl: `/api/images/${imageId}`,
                prompt: imagePrompt,
              });
              emit("done", { assistantMessageId: messageId });
              controller.close();
              return;
            } catch (e) {
              const upstreamStatus =
                e instanceof HttpError && e.details && typeof e.details === "object"
                  ? (e.details as { upstreamStatus?: number }).upstreamStatus
                  : undefined;
              const code = e instanceof HttpError ? e.code : undefined;
              const action = imageFailureAction(code, upstreamStatus);

              if (action === "capacity") {
                // Upstream quota/capacity exhausted → a calm chat message, not a scary
                // error banner (temporary provider limit, not a user/prompt issue).
                emit("route", { kind: "chat" });
                const msg =
                  "圖片產生服務目前額度用盡或忙線中 🙏，請稍後再試（通常過一段時間會自動恢復）。";
                const saved = await persistAssistant(sessionId, msg, null, false);
                emit("delta", { text: msg });
                emit("done", { assistantMessageId: saved.id });
                controller.close();
                return;
              }
              if (action === "rethrow") throw e;

              // The image model ran but produced no image, or it rejected the prompt
              // (400/422). Don't surface a scary error — fall through to a chat reply
              // that nudges the user to reword. Log which case for diagnostics.
              if (action === "no-output") {
                await logError({
                  scope: "generate.image-fallback",
                  code: "IMAGE_NO_OUTPUT",
                  status: upstreamStatus,
                  message: "生不出圖片，改用對話回覆並引導使用者改寫 prompt",
                  detail: e instanceof HttpError ? (e.details ?? e) : e,
                  sessionId,
                });
                fallbackHint = "no-output";
              } else {
                await logError({
                  scope: "generate.image-fallback",
                  code: "IMAGE_REJECTED",
                  status: upstreamStatus,
                  message: "圖片 prompt 被拒，改用對話回覆",
                  detail: e instanceof HttpError ? e.details : e,
                  sessionId,
                });
                fallbackHint = "rejected";
              }
            }
          } finally {
            releaseImageSlot(userId);
          }
        }

        // ---- Chat branch ----
        emit("route", { kind: "chat" });
        const payload = buildContext(history);
        // Vision: attach the current turn's uploaded image(s) to the last user
        // message so the model can actually see them. Only this turn ships bytes;
        // older turns keep the 〔使用者附上 N 張圖片〕 note from loadContextRows.
        if (hasAttachment) {
          const parts: ChatContent = [
            { type: "text", text: content || "請看這張我上傳的圖片，並提供協助。" },
            ...attachments.map((a) => ({
              type: "image_url" as const,
              image_url: { url: `data:${a.mime};base64,${a.bytes.toString("base64")}` },
            })),
          ];
          for (let i = payload.length - 1; i >= 0; i--) {
            if (payload[i].role === "user") {
              payload[i] = { role: "user", content: parts };
              break;
            }
          }
        }
        if (fallbackHint === "rejected") {
          payload.push({
            role: "system",
            content:
              "提示：使用者剛才的訊息看起來想生成圖片，但描述不夠具體。" +
              "請用最多兩句話、簡短友善地詢問他想要的圖片內容（主題、風格、場景即可），" +
              "不要列出範例清單或長篇說明，也不要說自己無法生成圖片。",
          });
        }
        if (fallbackHint === "no-output") {
          payload.push({
            role: "system",
            content:
              "提示：使用者剛才想生成圖片，我們已嘗試生成，但這次圖片服務沒有成功產生出圖片。" +
              "請用最多兩三句話、簡短友善地告訴他這次沒能生成出圖片，" +
              "並具體建議他把描述改得更清楚具體（例如補上主題、風格、場景、顏色或細節），或換個說法後再試一次。" +
              "語氣要親切、帶點鼓勵，不要列出長篇範例清單，也不要說自己完全沒有生成圖片的能力。",
          });
        }

        let upstream: Response;
        try {
          upstream = await chatStream(payload, upstreamAbort.signal);
        } catch {
          const once = await chatOnce(payload, upstreamAbort.signal);
          full = once.content;
          usage = once.usage;
          const saved = await persistAssistant(sessionId, full, usage, false);
          emit("delta", { text: full });
          emit("done", { assistantMessageId: saved.id, usage });
          controller.close();
          return;
        }

        const body = upstream.body;
        if (!body) throw new HttpError(502, "UPSTREAM", "AI 串流無回應");
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const { frames, rest } = parseSseFrames(buf);
          buf = rest;
          for (const frame of frames) {
            if (frame.data === "[DONE]") continue;
            let parsed: {
              choices?: { delta?: { content?: string } }[];
              usage?: Record<string, unknown>;
            };
            try {
              parsed = JSON.parse(frame.data);
            } catch {
              continue;
            }
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              emit("delta", { text: delta });
            }
            if (parsed?.usage) usage = parsed.usage;
          }
        }

        const saved = await persistAssistant(sessionId, full, usage, false);
        emit("done", { assistantMessageId: saved.id, usage });
        controller.close();
      } catch (err) {
        if (full) {
          await persistAssistant(sessionId, full, usage, true).catch(() => {});
        }
        if (!signal.aborted) {
          const he = err instanceof HttpError ? err : new HttpError(502, "UPSTREAM", "AI 回覆中斷");
          const ref = await logError({
            scope: "generate",
            code: he.code,
            status: he.status,
            message: he.message,
            detail: he.details ?? err,
            sessionId,
          });
          try {
            emit("error", { code: he.code, message: he.message, ref });
          } catch {
            /* controller may already be closed */
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      upstreamAbort.abort();
    },
  });
}
