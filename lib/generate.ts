import "server-only";
import { createImageMessage, loadContextRows, persistAssistant } from "@/db/queries";
import { chatOnce, chatStream, generateImage } from "./aiClient";
import { buildContext } from "./context";
import { logError } from "./errors";
import { HttpError } from "./http";
import { classifyImageIntent, hasImageCue } from "./intent";

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

/**
 * The shared chat/image generation core. Given a session and the (already
 * persisted) user message, it routes to image generation or streamed chat and
 * emits a normalized SSE stream. Used by both /chat and /regenerate.
 */
export function buildGenerationStream(opts: {
  sessionId: string;
  content: string;
  userMessageId: string;
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  const { sessionId, content, userMessageId, signal } = opts;

  const encoder = new TextEncoder();
  const sse = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const upstreamAbort = new AbortController();
  signal.addEventListener("abort", () => upstreamAbort.abort());

  const forced = content.startsWith(IMAGE_PREFIX);
  const forcedPrompt = forced ? content.slice(IMAGE_PREFIX.length).trim() : "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sse("meta", { userMessageId, sessionId }));
      let full = "";
      let usage: Record<string, unknown> | null = null;

      try {
        // ---- Route: image vs chat ----
        let kind: "chat" | "image" = "chat";
        let imagePrompt = "";
        let imageFallback = false;
        if (forced && forcedPrompt) {
          kind = "image";
          imagePrompt = forcedPrompt;
        } else if (hasImageCue(content)) {
          const verdict = await classifyImageIntent(content, upstreamAbort.signal);
          if (verdict.image && verdict.ready && verdict.prompt) {
            kind = "image";
            imagePrompt = verdict.prompt;
          } else if (verdict.image) {
            // Wants an image but the description is too vague — skip the slow
            // image round-trip and ask for specifics in chat instead.
            imageFallback = true;
          }
        }

        // ---- Image branch ----
        if (kind === "image") {
          controller.enqueue(sse("route", { kind: "image", prompt: imagePrompt }));
          try {
            const { buf, mime, width, height } = await generateImage(
              imagePrompt,
              upstreamAbort.signal,
            );
            const { imageId, messageId } = await createImageMessage({
              sessionId,
              prompt: imagePrompt,
              bytes: buf,
              mime,
              byteLen: buf.length,
              width,
              height,
            });
            controller.enqueue(
              sse("image", {
                imageId,
                messageId,
                imageUrl: `/api/images/${imageId}`,
                prompt: imagePrompt,
              }),
            );
            controller.enqueue(sse("done", {}));
            controller.close();
            return;
          } catch (e) {
            const upstreamStatus =
              e instanceof HttpError && e.details && typeof e.details === "object"
                ? (e.details as { upstreamStatus?: number }).upstreamStatus
                : undefined;
            // 400/422 = the image model rejected the prompt (too vague / not an
            // image request). Fall back to a chat reply so the assistant can ask
            // for a clearer description instead of surfacing a confusing error.
            if (upstreamStatus !== 400 && upstreamStatus !== 422) throw e;
            await logError({
              scope: "generate.image-fallback",
              code: "IMAGE_REJECTED",
              status: upstreamStatus,
              message: "圖片 prompt 被拒，改用對話回覆",
              detail: e instanceof HttpError ? e.details : e,
              sessionId,
            });
            imageFallback = true;
          }
        }

        // ---- Chat branch ----
        controller.enqueue(sse("route", { kind: "chat" }));
        const payload = buildContext(await loadContextRows(sessionId));
        if (imageFallback) {
          payload.push({
            role: "system",
            content:
              "提示：使用者剛才的訊息看起來想生成圖片，但描述不夠具體。" +
              "請用友善的一兩句話詢問他想要的圖片內容（例如主題、風格、場景），不要說自己無法生成圖片。",
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
          controller.enqueue(sse("delta", { text: full }));
          controller.enqueue(sse("done", { assistantMessageId: saved.id, usage }));
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

          const records = buf.split("\n\n");
          buf = records.pop() ?? "";
          for (const rec of records) {
            const dataLine = rec.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json || json === "[DONE]") continue;
            let parsed: {
              choices?: { delta?: { content?: string } }[];
              usage?: Record<string, unknown>;
            };
            try {
              parsed = JSON.parse(json);
            } catch {
              continue;
            }
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              controller.enqueue(sse("delta", { text: delta }));
            }
            if (parsed?.usage) usage = parsed.usage;
          }
        }

        const saved = await persistAssistant(sessionId, full, usage, false);
        controller.enqueue(sse("done", { assistantMessageId: saved.id, usage }));
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
            controller.enqueue(sse("error", { code: he.code, message: he.message, ref }));
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
