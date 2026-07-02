"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, apiGet, apiSend } from "@/lib/api/client";

interface AdminUser {
  id: string;
  username: string;
  canUpload: boolean;
  saveFolderId: string | null;
  createdAt: string;
  sessionCount: number;
}

export function AdminAccounts() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiGet<{ data: AdminUser[] }>("/api/admin/users").then((r) => r.data),
  });
  const [err, setErr] = useState<string | null>(null);
  const [nu, setNu] = useState("");
  const [np, setNp] = useState("");
  const [nUp, setNUp] = useState(false);
  const [nf, setNf] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "操作失敗");
    }
  }

  const users = q.data ?? [];
  return (
    <div className="space-y-4">
      {err && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="p-2 text-left">帳號</th>
              <th className="p-2">可上傳素材</th>
              <th className="p-2 text-left">雲端資料夾 ID（空=預設）</th>
              <th className="p-2">對話</th>
              <th className="p-2">動作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <AccountRow key={u.id} u={u} onRun={run} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 text-sm font-medium text-ink">新增帳號</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nu}
            onChange={(e) => setNu(e.target.value)}
            placeholder="帳號"
            className="rounded border border-line bg-canvas px-2 py-1.5 text-base text-ink"
          />
          <input
            value={np}
            onChange={(e) => setNp(e.target.value)}
            placeholder="密碼"
            className="rounded border border-line bg-canvas px-2 py-1.5 text-base text-ink"
          />
          <label className="flex items-center gap-1 text-sm text-ink">
            <input type="checkbox" checked={nUp} onChange={(e) => setNUp(e.target.checked)} />{" "}
            可上傳
          </label>
          <input
            value={nf}
            onChange={(e) => setNf(e.target.value)}
            placeholder="雲端資料夾 ID（可空）"
            className="rounded border border-line bg-canvas px-2 py-1.5 text-base text-ink"
          />
          <Button
            variant="brand"
            onClick={() =>
              run(async () => {
                if (!nu || !np) throw new ApiError(400, "", "請填帳號與密碼");
                await apiSend("/api/admin/users", "POST", {
                  username: nu,
                  password: np,
                  canUpload: nUp,
                  saveFolderId: nf,
                });
                setNu("");
                setNp("");
                setNUp(false);
                setNf("");
              })
            }
          >
            新增
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ u, onRun }: { u: AdminUser; onRun: (fn: () => Promise<unknown>) => void }) {
  const [folder, setFolder] = useState(u.saveFolderId ?? "");
  return (
    <tr className="border-t border-line">
      <td className="p-2 font-mono text-ink">{u.username}</td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={u.canUpload}
          onChange={(e) =>
            onRun(() =>
              apiSend(`/api/admin/users/${u.id}`, "PATCH", { canUpload: e.target.checked }),
            )
          }
        />
      </td>
      <td className="p-2">
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={() => {
            if ((u.saveFolderId ?? "") !== folder)
              onRun(() => apiSend(`/api/admin/users/${u.id}`, "PATCH", { saveFolderId: folder }));
          }}
          placeholder="（預設）"
          className="w-48 rounded border border-line bg-canvas px-2 py-1 font-mono text-xs text-ink"
        />
      </td>
      <td className="p-2 text-center text-muted">{u.sessionCount}</td>
      <td className="whitespace-nowrap p-2 text-center">
        <button
          type="button"
          className="text-xs text-muted hover:text-ink"
          onClick={() => {
            const p = window.prompt(`為 ${u.username} 設定新密碼`);
            if (p) onRun(() => apiSend(`/api/admin/users/${u.id}`, "PATCH", { password: p }));
          }}
        >
          改密碼
        </button>
        <button
          type="button"
          className="ml-3 text-xs text-danger"
          onClick={() => {
            if (window.confirm(`刪除帳號 ${u.username}？`))
              onRun(() => apiSend(`/api/admin/users/${u.id}`, "DELETE"));
          }}
        >
          刪除
        </button>
      </td>
    </tr>
  );
}
