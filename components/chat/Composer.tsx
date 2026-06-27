"use client";

import { Plus, Send, Square, X } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  disabled?: boolean; // no active session
  busy?: boolean; // streaming / generating
  onSend: (text: string, files?: File[]) => void;
  onStop: () => void;
}

const MAX_FILES = 4;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function Composer({ disabled, busy, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Thumbnails for the picked 素材; revoke object URLs on change/unmount.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [files]);

  function autosize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function pickFiles(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (chosen.length) setFiles((prev) => [...prev, ...chosen].slice(0, MAX_FILES));
    e.target.value = ""; // let the user re-pick the same file
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    const v = value.trim();
    if ((!v && files.length === 0) || disabled || busy) return;
    onSend(v, files.length ? files : undefined);
    setValue("");
    setFiles([]);
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = !disabled && !busy && (!!value.trim() || files.length > 0);

  return (
    <div className="flex-none border-t border-line bg-canvas/85 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2.5 backdrop-blur sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        {previews.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {previews.map((url, i) => (
              <div
                key={url}
                className="relative h-16 w-16 overflow-hidden rounded-lg border border-line bg-surface-2"
              >
                {/* biome-ignore lint/performance/noImgElement: local object-URL preview, not optimizable by next/image */}
                <img src={url} alt="素材預覽" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label="移除圖片"
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
          <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={pickFiles} />
          <Button
            variant="outline"
            size="icon"
            disabled={disabled || busy || files.length >= MAX_FILES}
            onClick={() => fileRef.current?.click()}
            aria-label="加入素材"
          >
            <Plus size={18} />
          </Button>
          {/*
            font-size must stay ≥ 16px: iOS Safari / in-app WebViews (FB / IG /
            LINE) auto-zoom the whole page when focusing any field smaller than
            16px and often don't zoom back out on blur, leaving the layout
            scaled-up ("比例跑掉") until the user pinch-zooms out manually.
          */}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              autosize();
            }}
            onKeyDown={onKey}
            rows={1}
            disabled={disabled || busy}
            placeholder={disabled ? "請先選擇對話" : "輸入訊息…"}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink outline-none placeholder:text-muted disabled:opacity-60"
          />
          {busy ? (
            <Button variant="outline" size="icon" onClick={onStop} aria-label="停止生成">
              <Square size={16} />
            </Button>
          ) : (
            <Button
              variant="brand"
              size="icon"
              onClick={submit}
              disabled={!canSend}
              aria-label="送出訊息"
            >
              <Send size={18} />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 font-mono text-[10px] text-muted">
          想要圖片時直接描述即可（例如「幫我畫一隻在營火旁的狼」），系統會自動生成；也可以按 ＋
          上傳圖片素材，請 AI 看圖或改造成新圖。
        </p>
      </div>
    </div>
  );
}
