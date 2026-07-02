"use client";

import { Flame, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { SessionMeta } from "@/lib/types";
import { SessionItem } from "./SessionItem";

interface Props {
  sessions: SessionMeta[];
  loading: boolean;
  username: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
}

export function SessionSidebar({
  sessions,
  loading,
  username,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onLogout,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 px-4 py-3.5">
        <Flame className="h-5 w-5 text-accent" strokeWidth={2.2} />
        <span className="text-[13px] font-semibold tracking-wide text-ink">
          臺北市第 11 次大露營
        </span>
      </div>

      <div className="px-3 pb-2">
        <Button variant="brand" size="md" onClick={onNew} className="w-full">
          <Plus size={16} /> 新對話
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-1" aria-label="對話列表">
        {loading ? (
          <SidebarSkeleton />
        ) : sessions.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">還沒有對話</p>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                onSelect={() => onSelect(s.id)}
                onRename={(t) => onRename(s.id, t)}
                onDelete={() => onDelete(s.id)}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
        >
          <LogOut size={15} /> 登出{username ? ` ${username}` : ""}
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-1 px-1 pt-1">
      {["a", "b", "c", "d", "e"].map((k) => (
        <div key={k} className="relative h-11 overflow-hidden rounded-lg bg-surface-2" aria-hidden>
          <span className="shimmer absolute inset-0" />
        </div>
      ))}
    </div>
  );
}
