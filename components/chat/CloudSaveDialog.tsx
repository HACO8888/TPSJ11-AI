"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useTeams } from "@/lib/hooks/useTeams";
import type { CloudSaveSize } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onConfirm: (teamCode: string, size: CloudSaveSize) => void;
}

const SIZES: { key: CloudSaveSize; label: string }[] = [
  { key: "original", label: "原圖" },
  { key: "small", label: "小 size（≤2MB）" },
  { key: "both", label: "都存（原圖＋小）" },
];

export function CloudSaveDialog({ open, onOpenChange, saving, onConfirm }: Props) {
  const teamsQ = useTeams();
  const [q, setQ] = useState("");
  const [teamCode, setTeamCode] = useState<string | null>(null);
  const [size, setSize] = useState<CloudSaveSize>("original");

  const teams = teamsQ.data ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return teams;
    return teams.filter(
      (t) => t.code.toLowerCase().includes(s) || t.name.toLowerCase().includes(s),
    );
  }, [teams, q]);

  function confirm() {
    if (!teamCode || saving) return;
    onConfirm(teamCode, size);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-in fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-2xl focus:outline-none"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Dialog.Title className="font-display text-base font-semibold text-ink">
              儲存到雲端
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="關閉" className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex min-h-0 flex-col">
              <div className="mb-1 text-xs text-muted">選擇小隊（必選）</div>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜尋代號或名稱…"
                  // ≥16px keeps iOS from auto-zooming on focus.
                  className="w-full rounded-lg border border-line bg-canvas py-2 pl-8 pr-2 text-base text-ink outline-none placeholder:text-muted"
                />
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">
                {teamsQ.isLoading ? (
                  <div className="p-3 text-sm text-muted">載入中…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-3 text-sm text-muted">找不到小隊</div>
                ) : (
                  filtered.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setTeamCode(t.code)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        teamCode === t.code
                          ? "bg-brand/15 text-brand"
                          : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span className="w-9 flex-none font-mono text-xs opacity-70">{t.code}</span>
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-muted">尺寸</div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSize(s.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      size === s.key
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-line text-ink hover:bg-surface-2"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button variant="brand" onClick={confirm} disabled={!teamCode || saving}>
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={16} className="animate-spin" /> 儲存中…
                </span>
              ) : (
                "儲存"
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
