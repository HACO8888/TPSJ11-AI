"use client";

import { useState } from "react";
import { AdminAccounts } from "@/components/admin/AdminAccounts";
import { AdminData } from "@/components/admin/AdminData";
import { AdminDrive } from "@/components/admin/AdminDrive";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { AdminUsage } from "@/components/admin/AdminUsage";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { useMe } from "@/lib/hooks/useMe";

const TABS = [
  { key: "usage", label: "用量" },
  { key: "accounts", label: "帳號" },
  { key: "teams", label: "小隊" },
  { key: "drive", label: "雲端 Drive" },
  { key: "settings", label: "系統參數" },
  { key: "data", label: "資料" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminPage() {
  const me = useMe();
  const [tab, setTab] = useState<TabKey>("usage");

  if (me.isLoading) return <div className="p-6 text-muted">載入中…</div>;
  if (!me.data?.isAdmin) {
    return (
      <div className="p-6 text-sm text-danger">
        沒有權限，此頁僅限管理員。
        <a href="/" className="ml-2 underline">
          回首頁
        </a>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-ink">管理後台</h1>
          <a href="/" className="text-sm text-muted hover:text-ink">
            ← 回應用
          </a>
        </div>
        <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-t-lg px-3 py-2 text-sm ${
                tab === t.key
                  ? "border-b-2 border-brand font-medium text-brand"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "usage" && <AdminUsage />}
        {tab === "accounts" && <AdminAccounts />}
        {tab === "teams" && <AdminTeams />}
        {tab === "drive" && <AdminDrive />}
        {tab === "settings" && <AdminSettings />}
        {tab === "data" && <AdminData />}
      </div>
    </ThemeProvider>
  );
}
