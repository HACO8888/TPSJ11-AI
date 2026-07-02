"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, apiGet, apiSend } from "@/lib/api/client";

interface Setting {
  key: string;
  value: unknown;
}
interface DriveCfg {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  tmpFolderId?: string;
  rootFolderId?: string;
}

export function AdminDrive() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => apiGet<{ data: Setting[] }>("/api/admin/settings").then((r) => r.data),
  });
  const [cfg, setCfg] = useState<DriveCfg>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const s = q.data?.find((x) => x.key === "google_drive");
    if (s) setCfg((s.value as DriveCfg) ?? {});
  }, [q.data]);

  const upd = (k: keyof DriveCfg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg((c) => ({ ...c, [k]: e.target.value }));

  async function save() {
    setErr(null);
    setMsg(null);
    try {
      await apiSend("/api/admin/settings", "PUT", { key: "google_drive", value: cfg });
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      setMsg("已儲存");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "儲存失敗");
    }
  }

  const inputCls = "w-full rounded border border-line bg-canvas px-2 py-1.5 text-base text-ink";
  return (
    <div className="max-w-xl space-y-3">
      <div className="text-sm text-muted">
        Google Drive OAuth 設定（app_settings.google_drive）。
      </div>
      {err && <div className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
      {msg && <div className="rounded bg-brand/10 px-3 py-2 text-sm text-brand">{msg}</div>}

      <label className="block">
        <span className="mb-1 block text-xs text-muted">Client ID</span>
        <input value={cfg.clientId ?? ""} onChange={upd("clientId")} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Client Secret</span>
        <input
          type="password"
          value={cfg.clientSecret ?? ""}
          onChange={upd("clientSecret")}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Refresh Token</span>
        <input
          type="password"
          value={cfg.refreshToken ?? ""}
          onChange={upd("refreshToken")}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">
          預設資料夾 ID（tmpFolderId — 未指定資料夾的帳號存這裡）
        </span>
        <input value={cfg.tmpFolderId ?? ""} onChange={upd("tmpFolderId")} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">根資料夾 ID（rootFolderId，選填）</span>
        <input value={cfg.rootFolderId ?? ""} onChange={upd("rootFolderId")} className={inputCls} />
      </label>

      <Button variant="brand" onClick={save}>
        儲存
      </Button>
    </div>
  );
}
