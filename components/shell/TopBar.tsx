"use client";

import { Loader2, Menu, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface Props {
  title: string;
  onOpenSidebar: () => void;
  /** Enabled only when the active session has at least one generated image. */
  canCloudSave: boolean;
  cloudSaving: boolean;
  onCloudSave: () => void;
}

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
      <Button
        variant="outline"
        size="icon"
        onClick={onCloudSave}
        disabled={!canCloudSave || cloudSaving}
        aria-label="將本對話的圖片儲存到雲端"
        title={canCloudSave ? "儲存圖片到雲端" : "這個對話還沒有生成圖片"}
      >
        {cloudSaving ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
      </Button>
      <div className="lg:hidden">
        <ThemeToggle />
      </div>
    </header>
  );
}
