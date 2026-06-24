"use client";

import { Send, Square } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  disabled?: boolean; // no active session
  busy?: boolean; // streaming / generating
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, busy, onSend, onStop }: Props) {
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
    onSend(v);
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

  return (
    <div className="flex-none border-t border-line bg-canvas/85 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2.5 backdrop-blur sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
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
              disabled ? "請先建立或選擇一個對話" : "輸入訊息…（Enter 送出，Shift+Enter 換行）"
            }
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-ink outline-none placeholder:text-muted disabled:opacity-60"
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
              disabled={disabled || !value.trim()}
              aria-label="送出訊息"
            >
              <Send size={18} />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 font-mono text-[10px] text-muted">
          想要圖片時直接描述即可（例如「幫我畫一隻在營火旁的狼」），系統會自動生成。
        </p>
      </div>
    </div>
  );
}
