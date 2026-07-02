"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Loader2, Menu, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { CloudSaveSize } from "@/lib/types";

interface Props {
  title: string;
  onOpenSidebar: () => void;
  /** Enabled only when the active session has at least one generated image. */
  canCloudSave: boolean;
  cloudSaving: boolean;
  onCloudSave: (size: CloudSaveSize) => void;
}

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-2";

export function TopBar({ title, onOpenSidebar, canCloudSave, cloudSaving, onCloudSave }: Props) {
  return (
    <header className="flex h-14 flex-none items-center gap-2 border-b border-line bg-canvas/85 px-3 backdrop-blur lg:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="開啟對話列表"
      >
        <Menu size={20} />
      </Button>
      <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-ink">
        {title}
      </h1>

      {/* Cloud save: a dropdown so the user picks original / 小 size / both per save. */}
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={!canCloudSave || cloudSaving}
            aria-label="將本對話的圖片儲存到雲端"
            title={canCloudSave ? "儲存圖片到雲端" : "這個對話還沒有生成圖片"}
          >
            {cloudSaving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <UploadCloud size={18} />
            )}
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[12rem] rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
            <div className="px-2 py-1 font-mono text-[10px] text-muted">儲存到雲端</div>
            <Dropdown.Item onSelect={() => onCloudSave("original")} className={ITEM_CLASS}>
              原圖
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => onCloudSave("small")} className={ITEM_CLASS}>
              小 size（≤2MB）
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => onCloudSave("both")} className={ITEM_CLASS}>
              都存（原圖＋小 size）
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <div className="lg:hidden">
        <ThemeToggle />
      </div>
    </header>
  );
}
