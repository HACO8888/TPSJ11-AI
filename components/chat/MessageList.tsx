"use client";

import { ArrowDown, Flame } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime, totalTokens } from "@/lib/format";
import type { LiveState } from "@/lib/hooks/useConversation";
import type { ChatMessageDTO } from "@/lib/types";
import { ImageMessage } from "./ImageMessage";
import { MarkdownRenderer } from "./MarkdownRenderer";

type NodeKind = "user" | "assistant" | "image" | "streaming";

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
    <div className="relative flex gap-3 pb-5">
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

function UserText({ content }: { content: string }) {
  const isImageReq = content.startsWith("/image ");
  const text = isImageReq ? content.slice(7) : content;
  return (
    <div className="inline-block max-w-full whitespace-pre-wrap break-words rounded-xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-[15px] text-ink">
      {isImageReq && (
        <span className="mr-1.5 inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 align-middle font-mono text-[11px] text-accent">
          <Flame size={11} /> 生圖
        </span>
      )}
      {text}
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

export function MessageList({ messages, live }: { messages: ChatMessageDTO[]; live: LiveState }) {
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
        className="h-full overflow-y-auto overscroll-contain"
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
                    <UserText content={m.content} />
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
                  <UserText content={live.userText} />
                </Row>
              )}
              {live.assistantText !== null && (
                <Row kind="streaming" label="營地助理 · 回覆中">
                  {live.assistantText === "" ? (
                    <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3">
                      <span className="inline-flex gap-1">
                        <Dot /> <Dot /> <Dot />
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3">
                      <span className="prose-camp whitespace-pre-wrap text-[15px]">
                        {live.assistantText}
                      </span>
                      <span className="caret">▍</span>
                    </div>
                  )}
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
        輸入訊息開始，或切換到「生圖」模式生成圖片。每個對話都有獨立的記憶。
      </p>
    </div>
  );
}
