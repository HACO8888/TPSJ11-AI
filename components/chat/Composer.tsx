"use client";

import { ImagePlus, MessageSquare, Send, Square } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Props {
  disabled?: boolean; // no active session
  busy?: boolean; // streaming / generating
  onSendText: (text: string) => void;
  onSendImage: (prompt: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, busy, onSendText, onSendImage, onStop }: Props) {
  const [mode, setMode] = useState<"chat" | "image">("chat");
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function autosize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submit() {
    const v = value.trim();
    if (!v || disabled || busy) return;
    if (mode === "image") onSendImage(v);
    else onSendText(v);
    setValue("");
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

  const seg = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition",
      active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink",
    );

  return (
    <div className="flex-none border-t border-line bg-canvas/85 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2.5 backdrop-blur sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-2 inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          <button type="button" onClick={() => setMode("chat")} className={seg(mode === "chat")}>
            <MessageSquare size={14} /> 對話
          </button>
          <button type="button" onClick={() => setMode("image")} className={seg(mode === "image")}>
            <ImagePlus size={14} /> 生圖
          </button>
        </div>

        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border bg-surface p-2 transition-colors",
            mode === "image" ? "border-accent/60" : "border-line",
          )}
        >
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
            placeholder={
              disabled
                ? "請先建立或選擇一個對話"
                : mode === "image"
                  ? "描述你想生成的圖片…"
                  : "輸入訊息…（Enter 送出，Shift+Enter 換行）"
            }
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-ink outline-none placeholder:text-muted disabled:opacity-60"
          />
          {busy ? (
            <Button variant="outline" size="icon" onClick={onStop} aria-label="停止生成">
              <Square size={16} />
            </Button>
          ) : (
            <Button
              variant={mode === "image" ? "primary" : "brand"}
              size="icon"
              onClick={submit}
              disabled={disabled || !value.trim()}
              aria-label={mode === "image" ? "生成圖片" : "送出訊息"}
            >
              {mode === "image" ? <ImagePlus size={18} /> : <Send size={18} />}
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 font-mono text-[10px] text-muted">
          {mode === "image" ? "生圖模式 · 圖片會記錄在此對話" : "AI 可能會出錯，重要資訊請自行查證"}
        </p>
      </div>
    </div>
  );
}
