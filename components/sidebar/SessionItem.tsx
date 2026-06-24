"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { SessionMeta } from "@/lib/types";

interface Props {
  session: SessionMeta;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

export function SessionItem({ session, active, onSelect, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);

  function commit() {
    const t = title.trim();
    if (t && t !== session.title) onRename(t);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: inline rename should grab focus immediately
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setTitle(session.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
        />
        <button type="button" onClick={commit} aria-label="確認">
          <Check size={15} className="text-brand" />
        </button>
        <button
          type="button"
          onClick={() => {
            setTitle(session.title);
            setEditing(false);
          }}
          aria-label="取消"
        >
          <X size={15} className="text-muted" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-lg pl-3 pr-1",
        active ? "bg-surface-2" : "hover:bg-surface-2/60",
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 py-2 text-left"
        aria-current={active ? "true" : undefined}
      >
        <div className="truncate text-sm text-ink">{session.title}</div>
        <div className="font-mono text-[10px] text-muted">{session.messageCount} 則訊息</div>
      </button>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label="更多動作"
            className="rounded-md p-1.5 text-muted opacity-0 hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreVertical size={16} />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[8rem] rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
            <Dropdown.Item
              onSelect={() => setEditing(true)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-2"
            >
              <Pencil size={14} /> 重新命名
            </Dropdown.Item>
            <Dropdown.Item
              onSelect={onDelete}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger outline-none data-[highlighted]:bg-surface-2"
            >
              <Trash2 size={14} /> 刪除
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
