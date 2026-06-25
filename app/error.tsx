"use client";

import { Flame, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh-safe flex-col items-center justify-center px-6 text-center">
      <Flame className="mb-4 h-10 w-10 text-accent" strokeWidth={1.8} />
      <h1 className="font-display text-2xl font-semibold text-ink">發生了一點狀況</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        頁面遇到非預期的錯誤。你可以重試，或回到首頁。
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted">錯誤編號：{error.digest}</p>
      )}
      <div className="mt-6 flex gap-2">
        <Button variant="brand" size="md" onClick={reset}>
          <RefreshCw size={16} /> 重試
        </Button>
        <a
          href="/"
          className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm text-ink hover:bg-surface-2"
        >
          回首頁
        </a>
      </div>
    </main>
  );
}
