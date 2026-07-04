import "server-only";
import { createImageMessage, createSession } from "@/db/queries";
import { generateImage } from "./aiClient";
import { logError } from "./errors";
import { acquireImageSlot, releaseImageSlot } from "./image-quota";
import { whitenBackground } from "./imageClean";
import { IMAGE_PRESETS } from "./imagePresets";
import { enhanceImagePrompt, wantsFlatWhite } from "./imagePrompt";

/**
 * Batch image generation: one image per list item (e.g. a nametag / certificate per
 * patrol), into a fresh session, streaming per-item progress over SSE. Generations run
 * sequentially so we respect the per-user concurrency limit and don't hammer the gateway
 * — the daily image quota still applies (hitting it stops the batch early, gracefully).
 */

export interface BatchInput {
  userId: string;
  presetKey: string;
  items: string[];
  signal: AbortSignal;
}

function buildBatchPrompt(
  presetLabel: string,
  style: string,
  aspect: string | undefined,
  item: string,
) {
  return enhanceImagePrompt(`${presetLabel}，主要文字「${item}」`, {
    key: "batch",
    label: presetLabel,
    style,
    aspect,
  });
}

export function buildBatchStream(opts: BatchInput): ReadableStream<Uint8Array> {
  const { userId, presetKey, items, signal } = opts;
  const enc = new TextEncoder();
  const sse = (event: string, data: unknown) =>
    enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const upstreamAbort = new AbortController();
  signal.addEventListener("abort", () => upstreamAbort.abort());

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => controller.enqueue(sse(event, data));
      try {
        const preset = IMAGE_PRESETS.find((p) => p.key === presetKey);
        if (!preset) {
          emit("error", { message: "找不到這個模板。" });
          controller.close();
          return;
        }

        const session = await createSession(userId, `批次：${preset.label}（${items.length}）`);
        emit("meta", { sessionId: session.id, total: items.length, preset: preset.label });
        // Flat-background presets (nametag/cert/badge) → clean the near-white background.
        const flat = wantsFlatWhite(preset.style);

        let count = 0;
        for (let i = 0; i < items.length; i++) {
          if (signal.aborted) break;
          const item = items[i];
          const slot = await acquireImageSlot(userId);
          if (!slot.ok) {
            emit("halt", {
              reason: slot.reason,
              message:
                slot.reason === "daily"
                  ? "今日生圖已達上限，批次先停在這裡，其餘明天再產。"
                  : "偵測到有其他生圖在進行，批次暫停，稍後再試。",
            });
            break;
          }
          try {
            const prompt = buildBatchPrompt(preset.label, preset.style, preset.aspect, item);
            const gen = await generateImage(prompt, upstreamAbort.signal);
            const bytes = flat ? await whitenBackground(gen.buf) : gen.buf;
            const { imageId } = await createImageMessage({
              sessionId: session.id,
              prompt: `${preset.label}：${item}`,
              bytes,
              mime: bytes === gen.buf ? gen.mime : "image/jpeg",
              byteLen: bytes.length,
              width: gen.width,
              height: gen.height,
            });
            count++;
            emit("progress", {
              done: count,
              index: i + 1,
              total: items.length,
              item,
              imageId,
              imageUrl: `/api/images/${imageId}`,
            });
          } catch (e) {
            await logError({
              scope: "batch.item",
              code: "BATCH_ITEM_FAIL",
              message: `批次項目生成失敗：${item}`,
              detail: e,
              sessionId: session.id,
            }).catch(() => {});
            emit("itemError", { index: i + 1, item, message: "這一張沒能生成，已略過。" });
          } finally {
            releaseImageSlot(userId);
          }
        }

        emit("done", { sessionId: session.id, count, total: items.length });
        controller.close();
      } catch (err) {
        if (!signal.aborted) {
          const ref = await logError({
            scope: "batch",
            code: "BATCH_FAIL",
            message: err instanceof Error ? err.message : "批次失敗",
            detail: err,
          });
          try {
            emit("error", { message: `批次生成發生問題（錯誤編號：${ref}）。` });
          } catch {
            /* controller may be closed */
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
