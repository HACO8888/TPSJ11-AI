"use client";

import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { useMe } from "@/lib/hooks/useMe";
import { IMAGE_PRESETS } from "@/lib/imagePresets";
import { parseSseFrames } from "@/lib/sse";

interface Result {
  item: string;
  imageUrl?: string;
  failed?: boolean;
}

export default function BatchPage() {
  const me = useMe();
  const [presetKey, setPresetKey] = useState(IMAGE_PRESETS[1]?.key ?? IMAGE_PRESETS[0].key);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Result[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const items = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function run() {
    if (running || items.length === 0) return;
    setRunning(true);
    setStatus(null);
    setResults([]);
    setSessionId(null);
    setProgress({ done: 0, total: items.length });

    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetKey, items }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setStatus(j?.error?.message ?? "批次啟動失敗");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { frames, rest } = parseSseFrames(buf);
        buf = rest;
        for (const f of frames) {
          let d: Record<string, unknown>;
          try {
            d = JSON.parse(f.data);
          } catch {
            continue;
          }
          if (f.event === "meta") setProgress({ done: 0, total: Number(d.total) || items.length });
          else if (f.event === "progress") {
            setProgress({ done: Number(d.done), total: Number(d.total) });
            setResults((r) => [...r, { item: String(d.item), imageUrl: String(d.imageUrl) }]);
          } else if (f.event === "itemError")
            setResults((r) => [...r, { item: String(d.item), failed: true }]);
          else if (f.event === "halt") setStatus(String(d.message));
          else if (f.event === "done") setSessionId(String(d.sessionId));
          else if (f.event === "error") setStatus(String(d.message));
        }
      }
    } catch {
      setStatus("批次過程中斷，請稍後再試。");
    } finally {
      setRunning(false);
    }
  }

  if (me.isLoading) return <div className="p-6 text-muted">載入中…</div>;
  const canUse = me.data?.canUpload === true;

  return (
    <ThemeProvider>
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <a href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft size={16} /> 回對話
          </a>
          <h1 className="font-display text-lg font-bold text-ink">批次生成</h1>
        </div>

        {!canUse ? (
          <div className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            批次生成僅限特定帳號使用，請洽管理員開啟權限。
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              選一個模板，貼上清單（每行一項，例如各小隊名稱），系統會一項一張逐一生成。
            </p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {IMAGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={running}
                  onClick={() => setPresetKey(p.key)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm disabled:opacity-50 ${
                    presetKey === p.key
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line bg-surface-2 text-ink hover:bg-surface"
                  }`}
                >
                  <span aria-hidden>{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={running}
              rows={8}
              placeholder={"第一小隊\n第二小隊\n第三小隊\n…（每行一項，最多 30 項）"}
              className="mb-3 w-full resize-y rounded-xl border border-line bg-surface p-3 text-base text-ink outline-none placeholder:text-muted"
            />

            <div className="mb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={run}
                disabled={running || items.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm text-brand-ink hover:opacity-90 disabled:opacity-50"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {running ? "生成中…" : `開始生成（${Math.min(items.length, 30)} 項）`}
              </button>
              {progress.total > 0 && (
                <span className="font-mono text-xs text-muted">
                  {progress.done}/{progress.total}
                </span>
              )}
            </div>

            {progress.total > 0 && (
              <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            )}

            {status && (
              <div className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink">
                {status}
              </div>
            )}

            {sessionId && (
              <div className="mb-4 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
                完成！已建立「批次」對話。
                <a href={`/?s=${sessionId}`} className="ml-2 underline">
                  前往查看
                </a>
                <a href="/gallery" className="ml-2 underline">
                  開啟圖庫
                </a>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {results.map((r) => (
                <div
                  key={r.imageUrl ?? r.item}
                  className="overflow-hidden rounded-lg border border-line bg-surface-2"
                >
                  {r.failed ? (
                    <div className="flex aspect-square items-center justify-center p-2 text-center text-xs text-danger">
                      {r.item}
                      <br />
                      （失敗）
                    </div>
                  ) : (
                    <a href={r.imageUrl} target="_blank" rel="noreferrer">
                      {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image */}
                      <img
                        src={`${r.imageUrl}?w=400`}
                        alt={r.item}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                  )}
                  <div className="truncate px-1.5 py-1 text-[11px] text-muted" title={r.item}>
                    {r.item}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ThemeProvider>
  );
}
