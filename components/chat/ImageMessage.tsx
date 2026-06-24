"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function ImageMessage({ imageUrl, prompt }: { imageUrl: string; prompt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 focus:outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{prompt}</Dialog.Title>
            {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image, not statically optimizable by next/image */}
            <img
              src={imageUrl}
              alt={prompt}
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <p className="mt-3 max-w-xl text-center text-sm text-white/70">{prompt}</p>
            <div className="mt-3 flex items-center gap-2">
              <a
                href={imageUrl}
                download={`tpsj11-${prompt.slice(0, 20)}.jpg`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20"
              >
                <Download size={16} /> 下載
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
