"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";

interface UsageStats {
  imagesToday: number;
  images7d: number;
  tokensTotal: number;
  byUser: { username: string | null; images: number }[];
  topPrompts: { prompt: string; count: number }[];
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="font-mono text-2xl font-bold text-ink">{value.toLocaleString("en-US")}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export function AdminUsage() {
  const q = useQuery({
    queryKey: ["admin", "data", "usage"],
    queryFn: () => apiGet<{ data: UsageStats }>("/api/admin/data?type=usage").then((r) => r.data),
  });

  if (q.isLoading) return <div className="text-muted">載入中…</div>;
  if (q.isError || !q.data) return <div className="text-danger">載入失敗，請稍後再試。</div>;
  const s = q.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="今日生圖" value={s.imagesToday} />
        <Stat label="近 7 天生圖" value={s.images7d} />
        <Stat label="累計 token" value={s.tokensTotal} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">各帳號生圖數</h3>
        <div className="overflow-hidden rounded-xl border border-line">
          {s.byUser.length === 0 && <div className="p-3 text-sm text-muted">尚無資料。</div>}
          {s.byUser.map((u, i) => (
            <div
              key={u.username ?? `u${i}`}
              className="flex items-center justify-between border-b border-line px-3 py-2 text-sm last:border-b-0"
            >
              <span className="text-ink">{u.username ?? "（已移除的帳號）"}</span>
              <span className="font-mono text-muted">{u.images} 張</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">熱門生圖描述</h3>
        <div className="overflow-hidden rounded-xl border border-line">
          {s.topPrompts.length === 0 && <div className="p-3 text-sm text-muted">尚無資料。</div>}
          {s.topPrompts.map((p) => (
            <div
              key={p.prompt}
              className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate text-ink" title={p.prompt}>
                {p.prompt}
              </span>
              <span className="shrink-0 font-mono text-muted">×{p.count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
        每人每日生圖上限與併發數，可到「系統參數」新增／編輯 <code>image_quota</code> 鍵，例如{" "}
        <code>{'{"dailyLimit":40,"maxConcurrent":2}'}</code>。未設定時使用預設值。
      </p>
    </div>
  );
}
