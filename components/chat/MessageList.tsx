"use client";

import { ArrowDown, Flame, Pencil, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatTime, totalTokens } from "@/lib/format";
import type { LiveState } from "@/lib/hooks/useConversation";
import type { ChatMessageDTO } from "@/lib/types";
import { ImageMessage } from "./ImageMessage";
import { MarkdownRenderer } from "./MarkdownRenderer";

type NodeKind = "user" | "assistant" | "image" | "streaming";

interface Props {
  messages: ChatMessageDTO[];
  live: LiveState;
  busy: boolean;
  onRegenerate: (messageId: string, content?: string) => void;
}

function Waypoint({ kind }: { kind: NodeKind }) {
  return (
    <div className="relative flex w-6 flex-none justify-center">
      <span
        className="absolute bottom-0 top-0 w-px border-l border-dashed border-line"
        aria-hidden
      />
      <span
        aria-hidden
        className={cn(
          "relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-canvas",
          kind === "user" && "border-2 border-muted bg-canvas",
          kind === "assistant" && "bg-brand",
          kind === "image" && "bg-accent",
          kind === "streaming" && "ember bg-accent",
        )}
      />
    </div>
  );
}

function Row({
  kind,
  label,
  time,
  tokens,
  children,
}: {
  kind: NodeKind;
  label: string;
  time?: string | null;
  tokens?: number | null;
  children: ReactNode;
}) {
  return (
    <div className="group/row relative flex gap-3 pb-5">
      <Waypoint kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-muted">
          <span className={cn(kind !== "user" && "text-brand")}>{label}</span>
          {time && <span>· {time}</span>}
          {tokens != null && <span>· {tokens} tok</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

function ImageReqBadge() {
  return (
    <span className="mr-1.5 inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 align-middle font-mono text-[11px] text-accent">
      <Flame size={11} /> 生圖
    </span>
  );
}

/** A persisted user message: renders markdown, with hover edit / regenerate. */
function UserMessage({
  message,
  busy,
  onRegenerate,
}: {
  message: ChatMessageDTO;
  busy: boolean;
  onRegenerate: (messageId: string, content?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(message.content);
  const isImageReq = message.content.startsWith("/image ");
  const shown = isImageReq ? message.content.slice(7) : message.content;

  if (editing) {
    return (
      <div className="rounded-xl rounded-tl-sm border border-accent/60 bg-surface-2 p-2">
        <textarea
          // biome-ignore lint/a11y/noAutofocus: inline edit should focus immediately
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={Math.min(8, Math.max(2, value.split("\n").length))}
          // ≥16px font keeps iOS / in-app browsers from auto-zooming on focus (see Composer).
          className="w-full resize-none bg-transparent px-1.5 py-1 text-base text-ink outline-none"
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            取消
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={!value.trim()}
            onClick={() => {
              const v = value.trim();
              setEditing(false);
              if (v && v !== message.content) onRegenerate(message.id, v);
            }}
          >
            送出
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {message.attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {message.attachments.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="block h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-2"
            >
              {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image, not optimizable by next/image */}
              <img src={a.url} alt="附件圖片" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {shown && (
        <div className="inline-block max-w-full break-words rounded-xl rounded-tl-sm bg-surface-2 px-3.5 py-1.5">
          {isImageReq && <ImageReqBadge />}
          <MarkdownRenderer content={shown} />
        </div>
      )}
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue(message.content);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          <Pencil size={11} /> 編輯
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRegenerate(message.id)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          <RefreshCw size={11} /> 重新生成
        </button>
      </div>
    </div>
  );
}

function AssistantText({ content, partial }: { content: string; partial?: boolean }) {
  return (
    <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3">
      <MarkdownRenderer content={content} />
      {partial && <p className="mt-2 font-mono text-[11px] text-muted">（已中斷）</p>}
    </div>
  );
}

export function MessageList({ messages, live, busy, onRegenerate }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages/live are intentional scroll triggers, not read in the body
  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, live, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  const isEmpty = messages.length === 0 && !live.userText && !live.assistantText && !live.image;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-contain"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {isEmpty ? (
            <EmptyConversation />
          ) : (
            <>
              {messages.map((m) =>
                m.kind === "image" && m.imageUrl ? (
                  <Row
                    key={m.id}
                    kind="image"
                    label="營地助理 · 圖片"
                    time={formatTime(m.createdAt)}
                  >
                    <ImageMessage imageUrl={m.imageUrl} prompt={m.content} />
                  </Row>
                ) : m.role === "user" ? (
                  <Row key={m.id} kind="user" label="你" time={formatTime(m.createdAt)}>
                    <UserMessage message={m} busy={busy} onRegenerate={onRegenerate} />
                  </Row>
                ) : (
                  <Row
                    key={m.id}
                    kind="assistant"
                    label="營地助理"
                    time={formatTime(m.createdAt)}
                    tokens={totalTokens(m.usage)}
                  >
                    <AssistantText content={m.content} partial={m.partial} />
                  </Row>
                ),
              )}

              {/* Optimistic + streaming rows */}
              {live.userText && (
                <Row kind="user" label="你">
                  <div className="inline-block max-w-full whitespace-pre-wrap break-words rounded-xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-[15px] text-ink">
                    {live.userText}
                  </div>
                </Row>
              )}
              {live.assistantText !== null && (
                <Row kind="streaming" label="營地助理 · 回覆中">
                  <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3">
                    {live.assistantText === "" ? (
                      <span className="inline-flex gap-1">
                        <Dot /> <Dot /> <Dot />
                      </span>
                    ) : (
                      <MarkdownRenderer content={live.assistantText} />
                    )}
                  </div>
                </Row>
              )}
              {live.image && (
                <Row kind="image" label="營地助理 · 圖片">
                  {live.image.status === "loading" ? (
                    <div className="relative flex aspect-[4/3] w-full max-w-sm items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2">
                      <span className="shimmer absolute inset-0" aria-hidden />
                      <span className="relative z-10 px-4 text-center font-mono text-xs text-muted">
                        生成圖片中… 約 10–30 秒
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-danger/40 bg-surface px-4 py-3 text-sm text-danger">
                      {live.image.error ?? "圖片生成失敗"}
                    </div>
                  )}
                </Row>
              )}
            </>
          )}
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            setAtBottom(true);
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink shadow-sm hover:bg-surface-2"
        >
          <ArrowDown size={14} /> 回到最新
        </button>
      )}
    </div>
  );
}

function Dot() {
  return <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />;
}

function EmptyConversation() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <Flame className="mb-3 h-8 w-8 text-accent" strokeWidth={1.8} />
      <h2 className="font-display text-lg font-semibold text-ink">開始第一段對話</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        直接輸入訊息開始。需要圖片時就說「幫我畫…」，系統會自動生成。每個對話都有獨立的記憶。
      </p>
    </div>
  );
}
