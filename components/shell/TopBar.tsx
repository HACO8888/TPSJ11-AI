"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function TopBar({ title, onOpenSidebar }: { title: string; onOpenSidebar: () => void }) {
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
      <div className="lg:hidden">
        <ThemeToggle />
      </div>
    </header>
  );
}
