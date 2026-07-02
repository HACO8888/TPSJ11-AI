"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api/client";

const TYPES = [
  { k: "sessions", label: "對話" },
  { k: "images", label: "圖片" },
  { k: "logs", label: "錯誤紀錄" },
] as const;

type DataType = (typeof TYPES)[number]["k"];

function fmt(v: unknown): string {
  if (v == null) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AdminData() {
  const qc = useQueryClient();
  const [type, setType] = useState<DataType>("sessions");
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin", "data", type],
    queryFn: () =>
      apiGet<{ data: Record<string, unknown>[] }>(`/api/admin/data?type=${type}`).then(
        (r) => r.data,
      ),
  });

  async function del(id: string) {
    setErr(null);
    if (!window.confirm("確定刪除這筆資料？此操作無法復原。")) return;
    try {
      await apiSend(`/api/admin/data/${type}/${id}`, "DELETE");
      await qc.invalidateQueries({ queryKey: ["admin", "data", type] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "刪除失敗");
    }
  }

  const rows = q.data ?? [];
  const cols = rows[0] ? Object.keys(rows[0]).filter((c) => c !== "id") : [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {TYPES.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setType(t.k)}
            className={`rounded px-3 py-1.5 text-sm ${
              type === t.k ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {err && <div className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-muted">
            <tr>
              {cols.map((c) => (
                <th key={c} className="p-2 text-left">
                  {c}
                </th>
              ))}
              <th className="p-2">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-line">
                {cols.map((c) => (
                  <td key={c} className="max-w-[16rem] truncate p-2 text-ink">
                    {fmt(r[c])}
                  </td>
                ))}
                <td className="p-2 text-center">
                  <button type="button" className="text-danger" onClick={() => del(String(r.id))}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && !q.isLoading && <div className="text-sm text-muted">沒有資料</div>}
    </div>
  );
}
