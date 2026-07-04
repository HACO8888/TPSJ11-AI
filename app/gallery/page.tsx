"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ImageOff, Search, X } from "lucide-react";
import { useState } from "react";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { apiGet } from "@/lib/api/client";

interface GalleryImage {
  id: string;
  prompt: string | null;
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
}

function fmt(v: string): string {
  return new Date(v).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
}

export default function GalleryPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<GalleryImage | null>(null);

  const query = useQuery({
    queryKey: ["gallery", q],
    queryFn: () =>
      apiGet<{ data: GalleryImage[] }>(
        `/api/gallery${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ).then((r) => r.data),
  });

  const images = query.data ?? [];

  return (
    <ThemeProvider>
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <a href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft size={16} /> 回對話
          </a>
          <h1 className="font-display text-lg font-bold text-ink">圖庫</h1>
          <a href="/batch" className="ml-auto text-sm text-brand hover:underline">
            批次生成 →
          </a>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
          }}
          className="mb-5 flex gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <Search size={16} className="text-muted" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="搜尋圖片描述…"
              className="min-h-[40px] flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setQ("");
                }}
                aria-label="清除"
              >
                <X size={15} className="text-muted hover:text-ink" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-brand px-4 text-sm text-brand-ink hover:opacity-90"
          >
            搜尋
          </button>
        </form>

        {query.isLoading && <div className="text-muted">載入中…</div>}
        {query.isError && <div className="text-danger">載入失敗，請稍後再試。</div>}
        {!query.isLoading && images.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-20 text-center text-muted">
            <ImageOff size={28} />
            <p>{q ? "找不到符合的圖片。" : "還沒有生成過任何圖片。回對話說「幫我畫…」開始吧！"}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(img)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2"
            >
              {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image */}
              <img
                src={`/api/images/${img.id}?w=400`}
                alt={img.prompt ?? "生成的圖片"}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            </button>
          ))}
        </div>

        <Dialog.Root open={!!active} onOpenChange={(o) => !o && setActive(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="overlay-in fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
            <Dialog.Content
              className="fixed inset-x-0 top-0 z-50 flex h-dvh-safe flex-col items-center gap-3 p-4 focus:outline-none"
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">{active?.prompt ?? "圖片"}</Dialog.Title>
              {active && (
                <>
                  <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                    {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image */}
                    <img
                      src={`/api/images/${active.id}?w=1280`}
                      alt={active.prompt ?? "圖片"}
                      className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                    />
                  </div>
                  <p className="line-clamp-2 max-w-xl shrink-0 text-center text-sm text-white/70">
                    {active.prompt ?? "（無描述）"}
                    <span className="ml-2 text-white/40">
                      · {active.sessionTitle} · {fmt(active.createdAt)}
                    </span>
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                    <a
                      href={`/?s=${active.sessionId}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20"
                    >
                      前往對話
                    </a>
                    <a
                      href={`/api/images/${active.id}`}
                      download={`tpsj11-${(active.prompt ?? "image").slice(0, 20)}.jpg`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20"
                    >
                      <Download size={16} /> 原圖
                    </a>
                    <Dialog.Close className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white hover:bg-white/20">
                      <X size={16} /> 關閉
                    </Dialog.Close>
                  </div>
                </>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </ThemeProvider>
  );
}
