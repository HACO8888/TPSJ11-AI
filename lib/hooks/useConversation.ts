"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { ApiError, apiGet } from "@/lib/api/client";
import type { ChatMessageDTO, PendingImage } from "@/lib/types";

export interface LiveState {
  userText: string | null;
  assistantText: string | null;
  image: PendingImage | null;
}
const EMPTY: LiveState = { userText: null, assistantText: null, image: null };

interface RunOpts {
  userText?: string;
  truncateAfterId?: string;
  editedContent?: string;
}

export function useConversation(sessionId: string | null) {
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = useQuery({
    queryKey: ["messages", sessionId],
    queryFn: () =>
      apiGet<{ data: ChatMessageDTO[] }>(`/api/sessions/${sessionId}/messages`).then((r) => r.data),
    enabled: !!sessionId,
  });

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["messages", sessionId] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  }, [qc, sessionId]);

  const run = useCallback(
    async (endpoint: "chat" | "regenerate", body: unknown, opts: RunOpts) => {
      if (!sessionId || busy) return;
      setError(null);
      setBusy(true);

      // Optimistic view: a fresh send shows the user bubble; a regenerate
      // truncates the cached list after the target turn (and applies the edit).
      if (opts.truncateAfterId) {
        qc.setQueryData<ChatMessageDTO[]>(["messages", sessionId], (old = []) => {
          const idx = old.findIndex((m) => m.id === opts.truncateAfterId);
          if (idx === -1) return old;
          const kept = old.slice(0, idx + 1);
          if (opts.editedContent != null) kept[idx] = { ...kept[idx], content: opts.editedContent };
          return kept;
        });
        setLive(EMPTY);
      } else {
        setLive({ userText: opts.userText ?? null, assistantText: null, image: null });
      }

      const ac = new AbortController();
      abortRef.current = ac;
      let streamErr: string | null = null;

      try {
        const res = await fetch(`/api/sessions/${sessionId}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
        });

        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => null);
          throw new ApiError(
            res.status,
            j?.error?.code ?? "ERROR",
            j?.error?.message ?? "送出失敗",
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let acc = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          for (;;) {
            const idx = buf.indexOf("\n\n");
            if (idx === -1) break;
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);

            let ev = "message";
            let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;

            let data: {
              kind?: string;
              text?: string;
              prompt?: string;
              message?: string;
              code?: string;
              ref?: string;
            };
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (ev === "route") {
              if (data.kind === "image") {
                setLive((l) => ({
                  ...l,
                  assistantText: null,
                  image: { id: "gen", prompt: data.prompt ?? "", status: "loading" },
                }));
              } else {
                // chat (incl. fallback from a rejected image prompt) — clear any
                // image-loading placeholder and show the streaming reply.
                setLive((l) => ({ ...l, assistantText: "", image: null }));
              }
            } else if (ev === "delta" && data.text) {
              acc += data.text;
              setLive((l) => ({ ...l, assistantText: acc }));
            } else if (ev === "error") {
              console.warn(
                `[chat] 伺服器錯誤 code=${data.code ?? "?"} ref=${data.ref ?? "?"} message=${data.message ?? ""}`,
              );
              streamErr = data.ref
                ? `${data.message ?? "AI 回覆失敗"}（錯誤編號：${data.ref}）`
                : (data.message ?? "AI 回覆失敗");
            }
            // ev === "image" / "done": result is persisted; reload renders it.
          }
        }

        if (streamErr) setError(streamErr);
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(e instanceof ApiError ? e.message : "送出失敗，請稍後再試");
        }
      } finally {
        await reload();
        setLive(EMPTY);
        setBusy(false);
        abortRef.current = null;
      }
    },
    [sessionId, busy, qc, reload],
  );

  const send = useCallback(
    (content: string) => run("chat", { content }, { userText: content }),
    [run],
  );

  const regenerate = useCallback(
    (messageId: string, content?: string) =>
      run("regenerate", content ? { messageId, content } : { messageId }, {
        truncateAfterId: messageId,
        editedContent: content,
      }),
    [run],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    live,
    busy,
    error,
    clearError: () => setError(null),
    send,
    regenerate,
    stop,
  };
}
