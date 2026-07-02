"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, apiGet, apiSend } from "@/lib/api/client";

interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export function AdminSettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => apiGet<{ data: Setting[] }>("/api/admin/settings").then((r) => r.data),
  });
  const [err, setErr] = useState<string | null>(null);
  const [nk, setNk] = useState("");
  const [nv, setNv] = useState("{}");

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "操作失敗");
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">所有 app_settings（原始 JSON）。⚠ 小心編輯。</div>
      {err && <div className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
      {(q.data ?? []).map((s) => (
        <SettingRow key={s.key} s={s} onRun={run} />
      ))}
      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 text-sm font-medium text-ink">新增 / 覆寫 key</div>
        <input
          value={nk}
          onChange={(e) => setNk(e.target.value)}
          placeholder="key"
          className="mb-2 w-full rounded border border-line bg-canvas px-2 py-1.5 text-base text-ink"
        />
        <textarea
          value={nv}
          onChange={(e) => setNv(e.target.value)}
          rows={4}
          className="w-full rounded border border-line bg-canvas p-2 font-mono text-xs text-ink"
        />
        <Button
          variant="brand"
          className="mt-2"
          onClick={() =>
            run(async () => {
              if (!nk) throw new ApiError(400, "", "缺少 key");
              let v: unknown;
              try {
                v = JSON.parse(nv);
              } catch {
                throw new ApiError(400, "", "JSON 格式錯誤");
              }
              await apiSend("/api/admin/settings", "PUT", { key: nk, value: v });
              setNk("");
              setNv("{}");
            })
          }
        >
          儲存
        </Button>
      </div>
    </div>
  );
}

function SettingRow({ s, onRun }: { s: Setting; onRun: (fn: () => Promise<unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(s.value, null, 2));
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-sm text-ink">{s.key}</span>
        <button
          type="button"
          className="text-xs text-danger"
          onClick={() => {
            if (window.confirm(`刪除設定 ${s.key}？`))
              onRun(() =>
                apiSend(`/api/admin/settings?key=${encodeURIComponent(s.key)}`, "DELETE"),
              );
          }}
        >
          刪除
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded border border-line bg-canvas p-2 font-mono text-xs text-ink"
      />
      <Button
        variant="outline"
        className="mt-2"
        onClick={() =>
          onRun(async () => {
            let v: unknown;
            try {
              v = JSON.parse(text);
            } catch {
              throw new ApiError(400, "", "JSON 格式錯誤");
            }
            await apiSend("/api/admin/settings", "PUT", { key: s.key, value: v });
          })
        }
      >
        儲存
      </Button>
    </div>
  );
}
