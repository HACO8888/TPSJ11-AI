"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, Loader2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Downloads stay under this size; larger images are re-encoded to fit. */
const DOWNLOAD_MAX_BYTES = 2 * 1024 * 1024;
/** Cap the longest side so we never paint an enormous canvas (AI images are usually ≤1536px). */
const DOWNLOAD_MAX_DIMENSION = 2048;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src; // same-origin → canvas won't be tainted
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Re-encode the (huge, ~8MB) generated JPEG to a download-friendly one, stepping
 * quality down until it fits under DOWNLOAD_MAX_BYTES. Resolution is preserved
 * unless the image is larger than DOWNLOAD_MAX_DIMENSION on its longest side.
 */
async function compressForDownload(src: string): Promise<Blob> {
  const img = await loadImage(src);
  const scale = Math.min(1, DOWNLOAD_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.92;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > DOWNLOAD_MAX_BYTES && quality > 0.4) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    blob = await canvasToBlob(canvas, quality);
  }
  if (!blob) throw new Error("encode failed");
  return blob;
}

function triggerDownload(href: string, filename: string, revoke: boolean) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) URL.revokeObjectURL(href);
}

export function ImageMessage({ imageUrl, prompt }: { imageUrl: string; prompt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const filename = `tpsj11-${prompt.slice(0, 20).trim() || "image"}.jpg`;

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await compressForDownload(imageUrl);
      triggerDownload(URL.createObjectURL(blob), filename, true);
    } catch {
      // Re-encode failed (e.g. very old browser) → fall back to the original bytes.
      triggerDownload(imageUrl, filename, false);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="放大檢視圖片"
        className="relative block w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface-2"
        style={{ minHeight: loaded ? undefined : "12rem" }}
      >
        {!loaded && <span className="shimmer absolute inset-0" aria-hidden />}
        {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image, not statically optimizable by next/image */}
        <img
          src={imageUrl}
          alt={prompt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={cn(
            "block w-full transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay-in fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed inset-x-0 top-0 z-50 flex h-dvh-safe flex-col items-center gap-3 p-4 focus:outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{prompt}</Dialog.Title>
            {/* flex-1 + min-h-0 lets the image fill leftover space and shrink so the
                caption/buttons footer never gets pushed off-screen. */}
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image, not statically optimizable by next/image */}
              <img
                src={imageUrl}
                alt={prompt}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>
            <p className="line-clamp-2 max-w-xl shrink-0 text-center text-sm text-white/70">
              {prompt}
            </p>
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {downloading ? "壓縮中…" : "下載小圖（≤2MB）"}
              </button>
              <a
                href={imageUrl}
                download={filename}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20"
              >
                <Download size={16} /> 原圖
              </a>
              <Dialog.Close
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20"
                aria-label="關閉"
              >
                <X size={16} /> 關閉
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
