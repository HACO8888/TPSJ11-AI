import "server-only";
import { createImageMessage, loadContextRows, persistAssistant } from "@/db/queries";
import { chatOnce, chatStream, generateImage } from "./aiClient";
import { buildContext } from "./context";
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
        if (forced && forcedPrompt) {
          kind = "image";
          imagePrompt = forcedPrompt;
        } else if (hasImageCue(content)) {
          const verdict = await classifyImageIntent(content, upstreamAbort.signal);
          if (verdict.image) {
            kind = "image";
            imagePrompt = verdict.prompt;
          }
        }

        // ---- Image branch ----
        if (kind === "image") {
          controller.enqueue(sse("route", { kind: "image", prompt: imagePrompt }));
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
        }

        // ---- Chat branch ----
        controller.enqueue(sse("route", { kind: "chat" }));
        const payload = buildContext(await loadContextRows(sessionId));

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
          try {
            controller.enqueue(sse("error", { code: he.code, message: he.message }));
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
