"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { ApiError, apiGet } from "@/lib/api/client";
import type { ChatMessageDTO, PendingImage } from "@/lib/types";

const IMAGE_TIMEOUT_MS = 120_000; // align with server maxDuration

export interface LiveState {
  userText: string | null;
  assistantText: string | null;
  image: PendingImage | null;
}
const EMPTY: LiveState = { userText: null, assistantText: null, image: null };

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

  const send = useCallback(
    async (content: string) => {
      if (!sessionId || busy) return;
      setError(null);
      setBusy(true);
      setLive({ userText: content, assistantText: "", image: null });

      const ac = new AbortController();
      abortRef.current = ac;
      let streamErr: string | null = null;

      try {
        const res = await fetch(`/api/sessions/${sessionId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
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
            j?.error?.message ?? "回覆失敗",
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

            let data: { text?: string; message?: string };
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (ev === "delta" && data.text) {
              acc += data.text;
              setLive((l) => ({ ...l, assistantText: acc }));
            } else if (ev === "error") {
              streamErr = data.message ?? "AI 回覆失敗";
            }
          }
        }

        if (streamErr) setError(streamErr);
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(e instanceof ApiError ? e.message : "回覆失敗，請稍後再試");
        }
      } finally {
        await reload();
        setLive(EMPTY);
        setBusy(false);
        abortRef.current = null;
      }
    },
    [sessionId, busy, reload],
  );

  const sendImage = useCallback(
    async (prompt: string) => {
      if (!sessionId || busy) return;
      setError(null);
      setBusy(true);
      const pendingId = `pending-${Date.now()}`;
      setLive({
        userText: `/image ${prompt}`,
        assistantText: null,
        image: { id: pendingId, prompt, status: "loading" },
      });

      const ac = new AbortController();
      abortRef.current = ac;
      const timeout = setTimeout(() => ac.abort(), IMAGE_TIMEOUT_MS);

      try {
        const res = await fetch(`/api/sessions/${sessionId}/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: ac.signal,
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new ApiError(
            res.status,
            j?.error?.code ?? "ERROR",
            j?.error?.message ?? "圖片生成失敗",
          );
        }
      } catch (e) {
        if (ac.signal.aborted) {
          // The server may still have committed the image — reload will reveal it.
          setError("圖片生成逾時，若仍未出現可重試。");
        } else {
          setError(e instanceof ApiError ? e.message : "圖片生成失敗，請稍後再試");
        }
      } finally {
        clearTimeout(timeout);
        await reload();
        setLive(EMPTY);
        setBusy(false);
        abortRef.current = null;
      }
    },
    [sessionId, busy, reload],
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
    sendImage,
    stop,
  };
}
